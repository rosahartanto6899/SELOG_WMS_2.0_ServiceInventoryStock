import { pivotOrderBySql } from '@/features/v1/soh-all-sloc/repositories/soh-all-sloc.repository';

describe('soh-all-sloc pivotOrderBySql (parity ORDER BY legacy)', () => {
  it('whitelist ter-map ke kolom SQL; totalQty = alias agregat', () => {
    expect(pivotOrderBySql('materialCode')).toBe('materialCode');
    expect(pivotOrderBySql('materialName')).toBe('materialName');
    expect(pivotOrderBySql('materialBrand')).toBe('materialBrand');
    expect(pivotOrderBySql('totalQty')).toBe('totalQty');
  });

  it('undefined → materialCode (default parity ORDER BY materialcode); input liar ditolak', () => {
    expect(pivotOrderBySql(undefined)).toBe('materialCode');
    expect(pivotOrderBySql('qtySOH; DROP TABLE')).toBe('materialCode');
  });
});
