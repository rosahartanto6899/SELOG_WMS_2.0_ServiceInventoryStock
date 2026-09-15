/**
 * Timestamp WIB untuk kolom audit (createdDate/modifiedDate/dll).
 *
 * Cukup `new Date()` — konversi +07:00 (WIB) ditangani Sequelize via
 * `timezone: '+07:00'` di database.util (dipatch _stringify tanpa suffix
 * offset). JANGAN tambah +7 jam manual di sini (double-shift!).
 */
export const nowWib = (): Date => new Date();
