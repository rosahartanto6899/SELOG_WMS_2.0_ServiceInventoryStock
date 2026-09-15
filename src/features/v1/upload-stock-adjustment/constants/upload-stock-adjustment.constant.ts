/**
 * Constants for Upload Stock Adjustment feature.
 * Kolom excel parity template lama CoreApp (ExcelHeaderLabelConstants):
 * MaterialCode, MaterialName, MaterialBrand, Qty — file lama tetap kompatibel.
 */

export interface AdjustmentColumn {
  header: string;
  key: string;
  width: number;
  optional?: boolean;
}

export const uploadStockAdjustmentConstant = {
  // === Excel workbook conventions (pola ServiceVehicle / upload-incoming-ahm) ===
  excelSheetMain: 'Formulir input',
  excelSheetBodyKey: 'Ref_bodyKey',
  excelSheetStateVeryHidden: 'veryHidden' as const,
  keyName: 'name',
  keyId: 'id',
  stringTypePattern: 'pattern',
  stringPatternSolid: 'solid',
  yellowHexColor: 'FFFF00',
  headerRowNumber: 5,
  excelCellWidth25: 25,
  excelCellWidth40: 40,
  stringHeaderNameContentType: 'Content-Type',
  stringHeaderValueSpreadsheet:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  stringHeaderNameContentDisposition: 'Content-Disposition',
  stringHeaderValueFilename:
    'attachment; filename=Template-UploadStockAdjustment.xlsx',
  templateFileName: 'Template-UploadStockAdjustment.xlsx',

  // === Mandatory read & instructions ===
  excelMandatoryRead: 'WAJIB DIBACA',
  excelInstructionPoint1:
    '1. Isi data mulai baris ke-6. Jangan mengubah urutan/nama kolom pada baris ke-5.',
  excelInstructionPoint2:
    '2. Semua kolom wajib diisi kecuali kolom berwarna kuning (opsional).',

  // === 4 kolom stock adjustment (header lama + field key) ===
  columns: [
    { header: 'MaterialCode', key: 'materialCode', width: 40 },
    { header: 'MaterialName', key: 'materialName', width: 40, optional: true },
    { header: 'MaterialBrand', key: 'materialBrand', width: 25, optional: true },
    { header: 'Qty', key: 'qty', width: 25 },
  ] as AdjustmentColumn[],

  // === Contoh baris — material asli CN001 di master (biar tidak membingungkan
  // saat tes; material tetap divalidasi per customer sesi aktif) ===
  exampleRow: ['000-928-03-74', 'SEAL RING, TRAVEL MOTOR', 'Hyundai PARTS', 100],

  // === Business (parity SP usp_InsertStockAdjustmentByFileName live dev) ===
  transactionType: 'Upload Stock Adjustment',
  logDeliveryNoteNo: '-',
  isActive: true,

  // === Permission ===
  menuCode: 'UPLOAD-STOCK-ADJUSTMENT',

  key: {
    materialCode: 'materialCode',
    materialName: 'materialName',
    materialBrand: 'materialBrand',
    qty: 'qty',
    warehouseCode: 'warehouseCode',
  },

  messages: {
    templateHeadersKeyNotMatch:
      'Konfigurasi header template tidak sesuai, hubungi administrator.',
    materialNotExist: "Material doesn't exist.",
    qtyNegative: 'Qty harus berupa angka positif.',
    required: 'Kolom ini wajib diisi.',
  },
} as const;
