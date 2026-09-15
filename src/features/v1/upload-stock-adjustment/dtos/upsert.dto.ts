import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { uploadStockAdjustmentConstant as cst } from '../constants/upload-stock-adjustment.constant';

/**
 * DTO untuk satu baris stock adjustment — dipakai PUT /v1/upload-stock-adjustment/bulk.
 * Frontend memanggil per baris (pola upsertVehicle ServiceVehicle / upload-incoming-ahm).
 * Regex alfanumerik parity model lama UploadStockAdjustment (CoreApp).
 */
export class UpsertDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9\[\]\(\)\-\/\#\&\+,.!? ]*$/, {
    message: 'MaterialCode harus dalam format alfanumerik',
  })
  materialCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9\[\]\(\)\-\/\#\&\+,.!? ]*$/, {
    message: 'MaterialName harus dalam format alfanumerik',
  })
  materialName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9\[\]\(\)\-\/\#\&\+,.!? ]*$/, {
    message: 'MaterialBrand harus dalam format alfanumerik',
  })
  materialBrand?: string;

  @IsInt({ message: cst.messages.qtyNegative })
  @Min(0, { message: cst.messages.qtyNegative })
  qty: number;

  // === Metadata FE (row tracker upload) — diterima, tidak dipakai BE ===
  @IsOptional()
  @IsInt()
  no?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  upsertStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  upsertReason?: string;
}
