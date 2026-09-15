import { injectable } from 'inversify';
import { Order, WhereOptions } from 'sequelize';
import { StockAvailability, StockAvailabilityLog } from '@/database/entities';

/** Row list stock availability (Q1) — parity StockAvailabilityDto legacy */
export interface StockListRow {
  id: string;
  customerCode: string | null;
  customerName: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialBrand: string | null;
  uom: string | null;
  qtyPlanIncoming: number | null;
  qtyPlanOutgoing: number | null;
  qtySOH: number | null;
  createdDate: Date | null;
}

/** Row mentah log (Q2) — parity tabel StockAvailabilityLog */
export interface StockLogRow {
  transactionType: string | null;
  deliveryNoteNo: string | null;
  qtySOHBefore: number | null;
  qtySOHAfter: number | null;
  poDate: Date | null;
  createdDate: Date | null;
  createdBy: string | null;
}

/** Query StockAvailability / StockAvailabilityLog — parity SP read
 *  (usp_ListStockAvailability / usp_GetHistoryStockOnHand), tanpa SP. */
@injectable()
export class StockAvailabilityRepository {
  /** Q1 — rows ter-filter tenant (parity SELECT utama SP) */
  public async findAll(
    where: WhereOptions,
    order: Order,
    limit: number,
    offset: number,
  ): Promise<StockListRow[]> {
    const rows = await StockAvailability.findAll({
      where,
      order,
      limit,
      offset,
      raw: true,
    });
    return rows as unknown as StockListRow[];
  }

  /** Q1 — COUNT untuk recordsTotal & recordsFiltered */
  public async countAll(where: WhereOptions): Promise<number> {
    return await StockAvailability.count({ where });
  }

  /** Q2 — log mutasi SOH satu material, terbaru dulu (parity SP WHERE+ORDER) */
  public async findHistory(
    customerCode?: string,
    warehouseCode?: string,
    materialCode?: string,
  ): Promise<StockLogRow[]> {
    const rows = await StockAvailabilityLog.findAll({
      where: {
        customerCode,
        warehouseCode,
        materialCode,
      },
      order: [['createdDate', 'DESC']],
      raw: true,
    });
    return rows as unknown as StockLogRow[];
  }
}
