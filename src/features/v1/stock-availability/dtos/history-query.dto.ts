import { IsOptional, IsString } from 'class-validator';

/**
 * @swagger
 * components:
 *   schemas:
 *     StockAvailabilityHistoryQueryDto:
 *       type: object
 *       required: [materialCode]
 *       properties:
 *         materialCode: { type: string }
 */
export class HistoryQueryDto {
  /** Deprecated: ignored — customer/warehouse diambil dari session aktif (req.user). */
  @IsOptional()
  @IsString({ message: 'CustomerCode must be a string' })
  customerCode?: string;

  /** Deprecated: ignored — lihat customerCode. */
  @IsOptional()
  @IsString({ message: 'WarehouseCode must be a string' })
  warehouseCode?: string;

  @IsString({ message: 'MaterialCode must be a string' })
  materialCode!: string;
}
