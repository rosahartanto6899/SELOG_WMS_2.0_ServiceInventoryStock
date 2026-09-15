import { claimAgeMs } from '@/listeners/base-sqs-listener';

/** Logika umur klaim stale — satu-satunya bagian murni dari recovery
 *  crash (steal klaim yatim). Gagal di sini = event hilang diam-diam. */
describe('claimAgeMs (stale dedup claim detection)', () => {
  const now = Date.parse('2026-09-15T10:00:00Z');

  it('klaim segar → umur kecil (duplikat asli, TIDAK boleh dicuri)', () => {
    expect(claimAgeMs(new Date(now - 5_000).toISOString(), now)).toBe(5_000);
  });

  it('klaim yatim (crash >10 mnt lalu) → umur besar → layak dicuri', () => {
    expect(claimAgeMs(new Date(now - 11 * 60_000).toISOString(), now)).toBe(
      11 * 60_000,
    );
  });

  it('value bukan ISO (tak pernah diharapkan) → null → diperlakukan segar', () => {
    expect(claimAgeMs('garbage', now)).toBeNull();
  });
});
