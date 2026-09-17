import { injectable } from 'inversify';
import { QueryTypes } from 'sequelize';
import { sequelize } from '@/utils/database.util';
import { SOH_ORDER_WHITELIST } from '../constants';

/** Row pivot per material — parity StockDto legacy (materialcode/warehouses dict/totalqty) */
export interface SohPivotRow {
  materialCode: string;
  materialName: string;
  materialBrand: string;
  totalQty: number;
  warehouses: Record<string, number>;
}

interface PivotQueryResult {
  rows: SohPivotRow[];
  totalData: number;
}

/** ORDER BY whitelist → kolom SQL. totalQty = alias agregat.
 *  Pure — mudah dites; dipakai repository untuk ORDER BY aman-injeksi. */
export function pivotOrderBySql(order?: string): string {
  return (
    SOH_ORDER_WHITELIST[order ?? 'materialCode'] ??
    SOH_ORDER_WHITELIST.materialCode
  );
}

/** Query SOH All SLOC — parity GetSOHAllSLOC + agregasi controller legacy,
 *  digabung jadi SATU query SQL: pivot CASE-SUM per warehouse + paging OFFSET.
 *  (Query DB dev: GROUP BY full 415k baris = 17–27s transfer; pivot SQL
 *  mengirim hanya halaman → <1s. Kolom CASE dibatasi warehouse token user.) */
@injectable()
export class SohAllSlocRepository {
  public async findPivotPage(
    baseWhere: string[],
    warehouseCodes: string[],
    replacements: Record<string, unknown>,
    order?: string,
    sort?: string,
    page = 1,
    limit = 10,
  ): Promise<PivotQueryResult> {
    const dir = sort === 'desc' ? 'DESC' : 'ASC';
    const orderBy = pivotOrderBySql(order);
    const offset = (page - 1) * limit;

    // kolom CASE per warehouse — reuse params :w0..:wN dari buildWhere;
    // kode dari token, bracket-escaped
    const caseCols = warehouseCodes
      .map(
        (code, i) =>
          `SUM(CASE WHEN warehouseCode = :w${i} THEN qtySOH ELSE 0 END) AS [${code.replace(/]/g, ']]')}]`,
      )
      .join(', ');

    const whereSql = baseWhere.join(' AND ');
    const groupBy = 'GROUP BY materialCode, materialName, materialBrand';

    const rowsSql = `
      SELECT materialCode, materialName, materialBrand,
             SUM(qtySOH) AS totalQty${caseCols ? ', ' + caseCols : ''}
      FROM StockAvailability
      ${whereSql ? 'WHERE ' + whereSql : ''}
      ${groupBy}
      ORDER BY ${orderBy} ${dir}
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT 1 AS x FROM StockAvailability
        ${whereSql ? 'WHERE ' + whereSql : ''}
        ${groupBy}
      ) t`;

    const rows = (await sequelize.query(rowsSql, {
      replacements,
      type: QueryTypes.SELECT,
    })) as unknown as Record<string, unknown>[];

    const countRes = (await sequelize.query(countSql, {
      replacements,
      type: QueryTypes.SELECT,
    })) as unknown as { total: number }[];

    return {
      rows: rows.map((r) => ({
        materialCode: String(r.materialCode ?? ''),
        materialName: String(r.materialName ?? ''),
        materialBrand: String(r.materialBrand ?? ''),
        totalQty: Number(r.totalQty ?? 0),
        warehouses: Object.fromEntries(
          warehouseCodes.map((code) => [code, Number(r[code] ?? 0)]),
        ),
      })),
      totalData: Number(countRes[0]?.total ?? 0),
    };
  }

  /** Bangun WHERE + replacements dari scope token & search — dipakai service */
  public buildWhere(
    customerCode: string | undefined,
    warehouseCodes: string[],
    search?: string,
    searchBy?: string,
  ): { baseWhere: string[]; replacements: Record<string, unknown> } {
    const baseWhere: string[] = [];
    const replacements: Record<string, unknown> = {};

    warehouseCodes.forEach((code, i) => {
      replacements[`w${i}`] = code;
    });
    if (warehouseCodes.length) {
      baseWhere.push(
        `warehouseCode IN (${warehouseCodes.map((_, i) => `:w${i}`).join(', ')})`,
      );
    }
    if (customerCode) {
      replacements.customerCode = customerCode;
      baseWhere.push('customerCode = :customerCode');
    }
    if (search) {
      replacements.search = `%${search}%`;
      // searchBy sudah divalidasi DTO (IsIn whitelist) — aman interpolate
      const col = searchBy ?? 'materialCode';
      const like = searchBy
        ? `${col} LIKE :search`
        : `(materialCode LIKE :search OR materialName LIKE :search OR materialBrand LIKE :search)`;
      baseWhere.push(like);
    }
    return { baseWhere, replacements };
  }
}
