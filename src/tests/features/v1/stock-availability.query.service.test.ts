import assert from 'node:assert/strict';
import { historyCategory, historyQty } from '@/features/v1/stock-availability/constants';

describe('stock-availability historyCategory/historyQty (parity usp_GetHistoryStockOnHand)', () => {
  it('Upload Stock Adjustment → Stock Adjustment, Qty = QtySOHAfter', () => {
    assert.equal(historyCategory('Upload Stock Adjustment', 10, 40), 'Stock Adjustment');
    assert.equal(historyQty('Upload Stock Adjustment', 10, 40), 40);
  });

  it('Binning Revision / PO Cancellation → Incoming', () => {
    assert.equal(historyCategory('Binning Revision', 50, 0), 'Incoming');
    assert.equal(historyCategory('PO Cancellation', 50, 0), 'Incoming');
  });

  it('Picking Revision / DO Cancellation → Outgoing', () => {
    assert.equal(historyCategory('Picking Revision', 0, 50), 'Outgoing');
    assert.equal(historyCategory('DO Cancellation', 0, 50), 'Outgoing');
  });

  it('delta naik → Incoming, delta turun → Outgoing; Qty = after−before', () => {
    assert.equal(historyCategory('Binning', 0, 50), 'Incoming');
    assert.equal(historyCategory('Actual Incoming Delete', 50, 0), 'Outgoing');
    assert.equal(historyQty('Binning', 0, 50), 50);
    assert.equal(historyQty('Actual Incoming Delete', 50, 0), -50);
  });
});
