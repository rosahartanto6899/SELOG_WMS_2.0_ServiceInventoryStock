import {
  insertQty,
  logDelta,
  transactionType,
  upsertDelta,
} from '@/listeners/constants/stock-availability-action.constant';
import { StockAvailabilityListener } from '@/listeners/handlers/stock-availability.listener';
import { PermanentMessageError } from '@/listeners/base-sqs-listener';

/** Parity CASE kedua SP live (usp_LogStockAvailability /
 *  usp_InsertUpdateStockAvailability) — diekstrak OBJECT_DEFINITION. */
describe('stock availability ActionType mapping', () => {
  it('logDelta: plus / minus / none termasuk quirk string kosong', () => {
    // '' ikut plus di SP LOG (quirk)...
    expect(logDelta('')).toBe('plus');
    ['WHSIN1', 'WHSIN2', 'WHSREVIN', 'WHSOUTX', 'WHSCLOUT'].forEach((a) =>
      expect(logDelta(a)).toBe('plus'),
    );
    ['WHSINX', 'WHSOUT', 'WHSREVOUT', 'WHSCLIN'].forEach((a) =>
      expect(logDelta(a)).toBe('minus'),
    );
    // ...tapi '' TIDAK plus di SP UPSERT
    expect(upsertDelta('')).toBe('none');
    ['WHSIN1', 'WHSIN2', 'WHSREVIN', 'WHSOUTX', 'WHSCLOUT'].forEach((a) =>
      expect(upsertDelta(a)).toBe('plus'),
    );
    ['WHSOUT', 'WHSREVOUT', 'WHSINX', 'WHSCLIN'].forEach((a) =>
      expect(upsertDelta(a)).toBe('minus'),
    );
    expect(logDelta('WHATEVER')).toBe('none');
    expect(upsertDelta('WHATEVER')).toBe('none');
  });

  it('insertQty: negatif hanya utk WHSOUT/WHSREVOUT (row baru)', () => {
    expect(insertQty('WHSOUT', 5)).toBe(-5);
    expect(insertQty('WHSREVOUT', 5)).toBe(-5);
    expect(insertQty('WHSIN2', 5)).toBe(5);
    expect(insertQty('WHSINX', 5)).toBe(5); // INX insert tetap positif
  });

  it('transactionType: mapping lengkap + Unknown', () => {
    expect(transactionType('WHSIN1')).toBe('Actual Plan Incoming');
    expect(transactionType('WHSIN2')).toBe('Binning');
    expect(transactionType('WHSREVIN')).toBe('Binning Revision');
    expect(transactionType('WHSINX')).toBe('Actual Incoming Delete');
    expect(transactionType('WHSOUT')).toBe('Picking');
    expect(transactionType('WHSREVOUT')).toBe('Picking Revision');
    expect(transactionType('WHSOUTX')).toBe('Actual Plan Outgoing Delete');
    expect(transactionType('WHSCLIN')).toBe('PO Cancellation');
    expect(transactionType('WHSCLOUT')).toBe('DO Cancellation');
    expect(transactionType('NOPE')).toBe('Unknown');
  });

  it('dedup key: stabil terhadap LogId (publisher retry), sensitif terhadap payload bisnis', () => {
    const listener = new StockAvailabilityListener();
    const key = (raw: string) =>
      (listener as any).buildDedupKey(raw) as string;

    const body = (logId: string) =>
      JSON.stringify({
        StockAvailabilityDtos: [
          { CustomerCode: 'CN001', WarehouseCode: 'W0001', MaterialCode: 'M-1', QtySOH: 5 },
        ],
        ActionType: 'WHSIN2',
        UserBy: 'user-a',
        LogId: logId,
      });

    // retry publisher = LogId beda → hash SAMA → dedup menangkap
    expect(key(body('uuid-1'))).toBe(key(body('uuid-2')));
    // event bisnis beda → hash beda
    const different = JSON.parse(body('uuid-1'));
    different.ActionType = 'WHSOUT';
    expect(key(JSON.stringify(different))).not.toBe(key(body('uuid-1')));
  });

  it('validasi permanen: payload rusak → PermanentMessageError (pesan di-delete, bukan loop)', async () => {
    const listener = new StockAvailabilityListener();
    const cases: unknown[] = [
      { StockAvailabilityDtos: [], ActionType: 'WHSIN2', UserBy: 'u' },
      { StockAvailabilityDtos: [{ CustomerCode: 'C', WarehouseCode: 'W', MaterialCode: 'M' }], ActionType: '', UserBy: 'u' },
      { StockAvailabilityDtos: [{ CustomerCode: 'C', WarehouseCode: 'W', MaterialCode: 'M' }], ActionType: 'WHSIN2' },
      { StockAvailabilityDtos: [{ CustomerCode: 'C', WarehouseCode: 'W' }], ActionType: 'WHSIN2', UserBy: 'u' },
    ];
    for (const c of cases) {
      await expect(listener.processMessage(c)).rejects.toBeInstanceOf(
        PermanentMessageError,
      );
    }
  });
});
