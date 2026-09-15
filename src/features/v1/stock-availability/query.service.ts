import { inject, injectable } from 'inversify';
import { Op, Order, WhereOptions } from 'sequelize';
import { HTTP_STATUS } from '@/shared-libs/constants/http-status.constant';
import { Pagination } from '@/shared-libs/helpers/pagination.helper';
import { StockAvailabilityRepository } from './repositories';
import {
  STOCK_LIST_ORDER_WHITELIST,
  STOCK_LIST_SEARCH_COLUMNS,
  historyCategory,
  historyQty,
} from './constants';

/** Q1–Q2 — query read-only dashboard Stock Availability
 *  (parity usp_ListStockAvailability & usp_GetHistoryStockOnHand) */
@injectable()
export class QueryService {
  constructor(
    @inject(StockAvailabilityRepository)
    private readonly repository: StockAvailabilityRepository,
  ) {}

  /** Q1 GET / — list stock per material. customerCode/warehouseCode dari
   *  session aktif (req.user), bukan dari FE; QtyAvailable = 0 parity SP. */
  async getAll(req: any) {
    const param = req.query;
    const page = Number(param.page ?? 1);
    const limit = Number(param.limit ?? 10);
    const { limit: size, offset } = Pagination.getPagination(page, limit);

    // tenant + gudang aktif dari token session, bukan input FE
    const baseWhere: WhereOptions = {};
    if (req.user?.tokenCustomerCode) {
      baseWhere.customerCode = req.user.tokenCustomerCode;
    }
    if (req.user?.tokenWarehouseCode) {
      baseWhere.warehouseCode = req.user.tokenWarehouseCode;
    }

    // recordsTotal: tanpa search (parity SP @TotalRecords)
    const recordsTotal = await this.repository.countAll(baseWhere);

    // recordsFiltered: + search LIKE 5 kolom (parity SP)
    const filteredWhere: WhereOptions = { ...baseWhere };
    if (param.search) {
      const like = `%${param.search}%`;
      if (param.searchBy) {
        filteredWhere[param.searchBy] = { [Op.like]: like };
      } else {
        filteredWhere[Op.or as unknown as string] =
          STOCK_LIST_SEARCH_COLUMNS.map((column) => ({
            [column]: { [Op.like]: like },
          }));
      }
    }
    const recordsFiltered = await this.repository.countAll(filteredWhere);

    const orderColumn =
      STOCK_LIST_ORDER_WHITELIST[param.order ?? 'customerCode'] ??
      'customerCode';
    const sort = param.sort === 'desc' ? 'DESC' : 'ASC';
    const order: Order = [[orderColumn, sort]];

    const rows = await this.repository.findAll(
      filteredWhere,
      order,
      size,
      offset,
    );

    return {
      page: {
        page: Number(page),
        limit: size,
        totalData: recordsFiltered,
        totalPage: Math.ceil(recordsFiltered / size),
        recordsTotal,
      },
      data: rows.map((r) => ({
        id: r.id,
        customerCode: r.customerCode,
        customerName: r.customerName,
        warehouseCode: r.warehouseCode,
        warehouseName: r.warehouseName,
        materialCode: r.materialCode,
        materialName: r.materialName,
        materialBrand: r.materialBrand,
        uom: r.uom,
        qtySOH: Number(r.qtySOH ?? 0),
        qtyPlanIncoming: Number(r.qtyPlanIncoming ?? 0),
        qtyPlanOutgoing: Number(r.qtyPlanOutgoing ?? 0),
        qtyAvailable: 0, // parity SP: 0 AS QtyAvailable
        createdAt: r.createdDate,
      })),
      httpCode: HTTP_STATUS.OK,
    };
  }

  /** Q2 GET /history — riwayat mutasi SOH satu material;
   *  Category & Qty diturunkan parity CASE usp_GetHistoryStockOnHand. */
  async getHistory(req: any) {
    // tenant + gudang aktif dari token session, bukan input FE
    const customerCode = req.user?.tokenCustomerCode ?? undefined;
    const warehouseCode = req.user?.tokenWarehouseCode ?? undefined;
    const { materialCode } = req.query;
    const rows = await this.repository.findHistory(
      customerCode,
      warehouseCode,
      materialCode,
    );
    return {
      data: rows.map((r) => {
        const before = r.qtySOHBefore ?? 0;
        const after = r.qtySOHAfter ?? 0;
        return {
          category: historyCategory(r.transactionType, before, after),
          transactionType: r.transactionType,
          deliveryNoteNo: r.deliveryNoteNo,
          qty: historyQty(r.transactionType, before, after),
          qtySOHBefore: before,
          qtySOHAfter: after,
          poDate: r.poDate,
          createdAt: r.createdDate,
          createdBy: r.createdBy,
        };
      }),
      httpCode: HTTP_STATUS.OK,
    };
  }
}
