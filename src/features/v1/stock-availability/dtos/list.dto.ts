import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  STOCK_LIST_ORDER_WHITELIST,
  STOCK_LIST_SEARCH_COLUMNS,
} from '../constants';

/**
 * @swagger
 * components:
 *   schemas:
 *     StockAvailabilityListDto:
 *       type: object
 *       properties:
 *         page: { type: integer, minimum: 1, example: 1 }
 *         limit: { type: integer, minimum: 1, maximum: 100, example: 10 }
 *         search: { type: string, example: "BRG-001" }
 *         searchBy: { type: string, enum: [materialCode, materialName, materialBrand, customerName, warehouseName], description: "Kolom search; tanpa searchBy = LIKE gabung 5 kolom (parity SP)" }
 *         order: { type: string, enum: [customerCode, customerName, warehouseCode, warehouseName, materialCode, materialName, materialBrand, qtySOH, qtyPlanIncoming, qtyPlanOutgoing, createdAt] }
 *         sort: { type: string, enum: [asc, desc] }
 */
export class ListDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;

  @IsOptional()
  @IsString({ message: 'SearchBy must be a string' })
  @IsIn([...STOCK_LIST_SEARCH_COLUMNS], {
    message: `SearchBy must be one of: ${STOCK_LIST_SEARCH_COLUMNS.join(', ')}`,
  })
  searchBy?: string;

  /** Deprecated: ignored — customer/warehouse diambil dari session aktif (req.user).
 *  Tetap diterima supaya FE lama tidak 422; FE berhenti kirim saatnya. */
  @IsOptional()
  @IsString({ message: 'CustomerCode must be a string' })
  customerCode?: string;

  /** Deprecated: ignored — lihat customerCode. */
  @IsOptional()
  @IsString({ message: 'WarehouseCode must be a string' })
  warehouseCode?: string;

  @IsOptional()
  @IsString({ message: 'Order must be a string' })
  @IsIn(Object.keys(STOCK_LIST_ORDER_WHITELIST), {
    message: `Order must be one of: ${Object.keys(STOCK_LIST_ORDER_WHITELIST).join(', ')}`,
  })
  order?: string;

  @IsOptional()
  @IsString({ message: 'Sort must be a string' })
  @IsIn(['asc', 'desc'], { message: 'Sort must be either asc or desc' })
  sort?: string;
}
