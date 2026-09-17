/** Konstanta modul SOH All SLOC Report — parity CoreApp Report/SOHAllSLOCReport */

export const sohAllSlocConstant = {
  menuCode: 'SOH-ALL-SLOC-REPORT',
};

/** Search LIKE gabung 3 kolom material — parity search GetSOHAllSLOC legacy */
export const SOH_SEARCH_COLUMNS = [
  'materialCode',
  'materialName',
  'materialBrand',
] as const;

/** Whitelist sort hasil pivot — parity ORDER BY materialcode legacy */
export const SOH_ORDER_WHITELIST: Record<string, string> = {
  materialCode: 'materialCode',
  materialName: 'materialName',
  materialBrand: 'materialBrand',
  totalQty: 'totalQty',
};
