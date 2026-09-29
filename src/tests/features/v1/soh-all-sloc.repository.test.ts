import assert from 'node:assert/strict';
import { pivotOrderBySql } from '@/features/v1/soh-all-sloc/repositories/soh-all-sloc.repository';

describe('soh-all-sloc pivotOrderBySql (parity ORDER BY legacy)', () => {
  it('whitelist ter-map ke kolom SQL; totalQty = alias agregat', () => {
    assert.equal(pivotOrderBySql('materialCode'), 'materialCode');
    assert.equal(pivotOrderBySql('materialName'), 'materialName');
    assert.equal(pivotOrderBySql('materialBrand'), 'materialBrand');
    assert.equal(pivotOrderBySql('totalQty'), 'totalQty');
  });

  it('undefined → materialCode (default parity ORDER BY materialcode); input liar ditolak', () => {
    assert.equal(pivotOrderBySql(undefined), 'materialCode');
    assert.equal(pivotOrderBySql('qtySOH; DROP TABLE'), 'materialCode');
  });
});
