/**
 * ActionType semantics — parity SP live wms-inventorystock-dev
 * (usp_LogStockAvailability & usp_InsertUpdateStockAvailability,
 * diekstrak via OBJECT_DEFINITION; lihat specs/…sqs-listener_reverse_spec.md).
 */

export type StockDelta = 'plus' | 'minus' | 'none';

/** Grup delta QtySOH — UNTUK LOG (QtySOHAfter). Perhatikan: '' (string
 *  kosong) ikut plus di SP log, tapi TIDAK di SP upsert. */
export function logDelta(actionType: string): StockDelta {
  if (['WHSIN1', 'WHSIN2', 'WHSREVIN', '', 'WHSOUTX', 'WHSCLOUT'].includes(actionType))
    return 'plus';
  if (['WHSINX', 'WHSOUT', 'WHSREVOUT', 'WHSCLIN'].includes(actionType))
    return 'minus';
  return 'none';
}

/** Grup delta QtySOH — UNTUK UPSERT stock existing (MERGE MATCHED). */
export function upsertDelta(actionType: string): StockDelta {
  if (['WHSIN1', 'WHSIN2', 'WHSREVIN', 'WHSOUTX', 'WHSCLOUT'].includes(actionType))
    return 'plus';
  if (['WHSOUT', 'WHSREVOUT', 'WHSINX', 'WHSCLIN'].includes(actionType))
    return 'minus';
  return 'none';
}

/** QtySOH row BARU (MERGE NOT MATCHED) — negatif utk WHSOUT/WHSREVOUT. */
export function insertQty(actionType: string, qty: number): number {
  return actionType === 'WHSOUT' || actionType === 'WHSREVOUT' ? -qty : qty;
}

/** Parity CASE TransactionType usp_LogStockAvailability. */
export function transactionType(actionType: string): string {
  const map: Record<string, string> = {
    WHSIN1: 'Actual Plan Incoming',
    WHSIN2: 'Binning',
    WHSREVIN: 'Binning Revision',
    WHSINX: 'Actual Incoming Delete',
    WHSOUT: 'Picking',
    WHSREVOUT: 'Picking Revision',
    WHSOUTX: 'Actual Plan Outgoing Delete',
    WHSCLIN: 'PO Cancellation',
    WHSCLOUT: 'DO Cancellation',
  };
  return map[actionType] ?? 'Unknown';
}

/** Row PascalCase SQS — parity StockAvailabilityDto CoreApp + publisher
 *  aws-sqs.third.ts (StockAvailabilityMessage). */
export interface StockAvailabilitySqsRow {
  ID?: number | null;
  CustomerCode?: string | null;
  CustomerName?: string | null;
  DeliveryNoteNo?: string | null;
  Description?: string | null;
  POType?: string | null;
  PODate?: string | null;
  WarehouseCode?: string | null;
  WarehouseName?: string | null;
  MaterialCode?: string | null;
  MaterialName?: string | null;
  MaterialBrand?: string | null;
  UoM?: string | null;
  QtyPlanIncoming?: number | null;
  QtyPlanOutgoing?: number | null;
  QtySOH?: number | null;
}

export interface StockAvailabilitySqsMessage {
  StockAvailabilityDtos: StockAvailabilitySqsRow[];
  ActionType: string;
  UserBy?: string | null;
  LogId?: string | null;
}
