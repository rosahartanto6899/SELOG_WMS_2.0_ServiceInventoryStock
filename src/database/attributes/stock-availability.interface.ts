/** Atribut tabel StockAvailability (existing, wms-inventorystock-dev) */
export interface StockAvailabilityAttributes {
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
  isActive: boolean | null;
  createdDate: Date | null;
  createdBy: string | null;
  modifiedDate: Date | null;
  modifiedBy: string | null;
  deletedDate: Date | null;
  deletedBy: string | null;
}

/** Atribut tabel StockAvailabilityLog (existing) — sumber usp_GetHistoryStockOnHand */
export interface StockAvailabilityLogAttributes {
  id: string;
  customerCode: string | null;
  customerName: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  deliveryNoteNo: string | null;
  transactionType: string | null;
  poDate: Date | null;
  materialCode: string | null;
  materialName: string | null;
  materialBrand: string | null;
  uom: string | null;
  qtySOHBefore: number | null;
  qtySOHAfter: number | null;
  description: string | null;
  createdDate: Date | null;
  createdBy: string | null;
}
