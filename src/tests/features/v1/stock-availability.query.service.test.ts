import { historyCategory, historyQty } from '@/features/v1/stock-availability/constants';

describe('stock-availability historyCategory/historyQty (parity usp_GetHistoryStockOnHand)', () => {
  it('Upload Stock Adjustment → Stock Adjustment, Qty = QtySOHAfter', () => {
    expect(historyCategory('Upload Stock Adjustment', 10, 40)).toBe('Stock Adjustment');
    expect(historyQty('Upload Stock Adjustment', 10, 40)).toBe(40);
  });

  it('Binning Revision / PO Cancellation → Incoming', () => {
    expect(historyCategory('Binning Revision', 50, 0)).toBe('Incoming');
    expect(historyCategory('PO Cancellation', 50, 0)).toBe('Incoming');
  });

  it('Picking Revision / DO Cancellation → Outgoing', () => {
    expect(historyCategory('Picking Revision', 0, 50)).toBe('Outgoing');
    expect(historyCategory('DO Cancellation', 0, 50)).toBe('Outgoing');
  });

  it('delta naik → Incoming, delta turun → Outgoing; Qty = after−before', () => {
    expect(historyCategory('Binning', 0, 50)).toBe('Incoming');
    expect(historyCategory('Actual Incoming Delete', 50, 0)).toBe('Outgoing');
    expect(historyQty('Binning', 0, 50)).toBe(50);
    expect(historyQty('Actual Incoming Delete', 50, 0)).toBe(-50);
  });
});
