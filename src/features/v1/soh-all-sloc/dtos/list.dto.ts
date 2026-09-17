import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SOH_ORDER_WHITELIST, SOH_SEARCH_COLUMNS } from '../constants';

/**
 * @swagger
 * components:
 *   schemas:
 *     SohAllSlocListDto:
 *       type: object
 *       properties:
 *         page: { type: integer, minimum: 1, example: 1 }
 *         limit: { type: integer, minimum: 1, maximum: 100, example: 10 }
 *         search: { type: string, example: "BRG-001" }
 *         searchBy: { type: string, enum: [materialCode, materialName, materialBrand] }
 *         order: { type: string, enum: [materialCode, materialName, materialBrand, totalQty] }
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
  @IsIn([...SOH_SEARCH_COLUMNS], {
    message: `SearchBy must be one of: ${SOH_SEARCH_COLUMNS.join(', ')}`,
  })
  searchBy?: string;

  @IsOptional()
  @IsString({ message: 'Order must be a string' })
  @IsIn(Object.keys(SOH_ORDER_WHITELIST), {
    message: `Order must be one of: ${Object.keys(SOH_ORDER_WHITELIST).join(', ')}`,
  })
  order?: string;

  @IsOptional()
  @IsString({ message: 'Sort must be a string' })
  @IsIn(['asc', 'desc'], { message: 'Sort must be either asc or desc' })
  sort?: string;
}
