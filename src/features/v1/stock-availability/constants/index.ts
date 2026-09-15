/** Konstanta modul Stock Availability — dashboard stock (parity CoreApp
 *  StockAvailabilityDashboard + SP live wms-inventorystock-dev) */

/** Q1 search LIKE gabung 5 kolom — parity usp_ListStockAvailability */
export const STOCK_LIST_SEARCH_COLUMNS = [
  'materialCode',
  'materialName',
  'materialBrand',
  'customerName',
  'warehouseName',
] as const;

/** Q1 whitelist kolom sort — parity usp_ListStockAvailability */
export const STOCK_LIST_ORDER_WHITELIST: Record<string, string> = {
  customerCode: 'customerCode',
  customerName: 'customerName',
  warehouseCode: 'warehouseCode',
  warehouseName: 'warehouseName',
  materialCode: 'materialCode',
  materialName: 'materialName',
  materialBrand: 'materialBrand',
  qtyPlanIncoming: 'qtyPlanIncoming',
  qtyPlanOutgoing: 'qtyPlanOutgoing',
  qtySOH: 'qtySOH',
  createdAt: 'createdDate',
};

export const stockAvailabilityConstant = {
  menuCode: 'STOCK-AVAILABILITY',
};

/** Q2 — parity usp_GetHistoryStockOnHand: Category & Qty diturunkan dari log */
export function historyCategory(
  transactionType: string | null,
  qtySOHBefore: number,
  qtySOHAfter: number,
): string {
  if (transactionType === 'Upload Stock Adjustment') return 'Stock Adjustment';
  if (transactionType === 'Binning Revision' || transactionType === 'PO Cancellation')
    return 'Incoming';
  if (transactionType === 'Picking Revision' || transactionType === 'DO Cancellation')
    return 'Outgoing';
  if (qtySOHAfter > qtySOHBefore) return 'Incoming';
  return 'Outgoing';
}

/** Q2 — Qty: adjustment pakai QtySOHAfter, lainnya delta after−before */
export function historyQty(
  transactionType: string | null,
  qtySOHBefore: number,
  qtySOHAfter: number,
): number {
  if (transactionType === 'Upload Stock Adjustment') return qtySOHAfter;
  return qtySOHAfter - qtySOHBefore || 0;
}
