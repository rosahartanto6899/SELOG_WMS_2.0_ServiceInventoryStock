import assert from 'node:assert/strict';
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
    assert.equal(logDelta(''), 'plus');
    ['WHSIN1', 'WHSIN2', 'WHSREVIN', 'WHSOUTX', 'WHSCLOUT'].forEach((a) =>
      assert.equal(logDelta(a), 'plus'),
    );
    ['WHSINX', 'WHSOUT', 'WHSREVOUT', 'WHSCLIN'].forEach((a) =>
      assert.equal(logDelta(a), 'minus'),
    );
    // ...tapi '' TIDAK plus di SP UPSERT
    assert.equal(upsertDelta(''), 'none');
    ['WHSIN1', 'WHSIN2', 'WHSREVIN', 'WHSOUTX', 'WHSCLOUT'].forEach((a) =>
      assert.equal(upsertDelta(a), 'plus'),
    );
    ['WHSOUT', 'WHSREVOUT', 'WHSINX', 'WHSCLIN'].forEach((a) =>
      assert.equal(upsertDelta(a), 'minus'),
    );
    assert.equal(logDelta('WHATEVER'), 'none');
    assert.equal(upsertDelta('WHATEVER'), 'none');
  });

  it('insertQty: negatif hanya utk WHSOUT/WHSREVOUT (row baru)', () => {
    assert.equal(insertQty('WHSOUT', 5), -5);
    assert.equal(insertQty('WHSREVOUT', 5), -5);
    assert.equal(insertQty('WHSIN2', 5), 5);
    assert.equal(insertQty('WHSINX', 5), 5); // INX insert tetap positif
  });

  it('transactionType: mapping lengkap + Unknown', () => {
    assert.equal(transactionType('WHSIN1'), 'Actual Plan Incoming');
    assert.equal(transactionType('WHSIN2'), 'Binning');
    assert.equal(transactionType('WHSREVIN'), 'Binning Revision');
    assert.equal(transactionType('WHSINX'), 'Actual Incoming Delete');
    assert.equal(transactionType('WHSOUT'), 'Picking');
    assert.equal(transactionType('WHSREVOUT'), 'Picking Revision');
    assert.equal(transactionType('WHSOUTX'), 'Actual Plan Outgoing Delete');
    assert.equal(transactionType('WHSCLIN'), 'PO Cancellation');
    assert.equal(transactionType('WHSCLOUT'), 'DO Cancellation');
    assert.equal(transactionType('NOPE'), 'Unknown');
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
    assert.equal(key(body('uuid-1')), key(body('uuid-2')));
    // event bisnis beda → hash beda
    const different = JSON.parse(body('uuid-1'));
    different.ActionType = 'WHSOUT';
    assert.notEqual(key(JSON.stringify(different)), key(body('uuid-1')));
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
      await assert.rejects(
        listener.processMessage(c),
        PermanentMessageError,
      );
    }
  });
});
