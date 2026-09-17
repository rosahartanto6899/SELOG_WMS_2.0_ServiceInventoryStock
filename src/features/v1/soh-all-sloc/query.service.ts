import { inject, injectable } from 'inversify';
import { HTTP_STATUS } from '@/shared-libs/constants/http-status.constant';
import { Pagination } from '@/shared-libs/helpers/pagination.helper';
import { SohAllSlocRepository } from './repositories';

/** Q — SOH All SLOC: pivot stock per material × semua warehouse user
 *  (parity ReportController.GetSOHAllSLOCReport* CoreApp, jadi satu request;
 *  pivot & paging dieksekusi SQL — lihat catatan performa di repository) */
@injectable()
export class QueryService {
  constructor(
    @inject(SohAllSlocRepository)
    private readonly repository: SohAllSlocRepository,
  ) {}

  /** GET / — scope dari token (customer + semua warehouse user) */
  async getAll(req: any) {
    const param = req.query;
    const page = Number(param.page ?? 1);
    const limit = Number(param.limit ?? 10);
    const { limit: size } = Pagination.getPagination(page, limit);

    // kolom = SEMUA warehouse user dari token (session ServiceUser sudah
    // ter-scope customer aktif). Warehouse tanpa stok tetap tampil, qty 0 —
    // parity legacy. Data tetap difilter customer aktif via buildWhere.
    const warehouseCodes = (req.user?.warehouses ?? [])
      .map((w: { warehouseCode: string }) => w.warehouseCode)
      .filter(Boolean);

    const { baseWhere, replacements } = this.repository.buildWhere(
      req.user?.tokenCustomerCode,
      warehouseCodes,
      param.search,
      param.searchBy,
    );

    const { rows, totalData } = await this.repository.findPivotPage(
      baseWhere,
      warehouseCodes,
      replacements,
      param.order,
      param.sort,
      page,
      size,
    );

    return {
      page: {
        page: Number(page),
        limit: size,
        totalData,
        totalPage: Math.ceil(totalData / size),
        recordsTotal: totalData,
      },
      // envelope middleware hanya meneruskan body.data & body.page —
      // kolom dinamis warehouse wajib ikut di dalam data
      data: {
        warehouses: warehouseCodes,
        rows,
      },
      httpCode: HTTP_STATUS.OK,
    };
  }
}
