import { injectable } from 'inversify';
import SecretManager from '@/shared-libs/utils/secret-manager.util';
import InternalService from './internal-service';

/** Envelope respons ServiceMasterData (middleware ResponseJson). */
interface MasterEnvelope<T> {
  data: T | null;
  message?: string;
}

/** Material dari MstMaterial (ServiceMasterData) — field parity entity. */
export interface MasterMaterial {
  id: string;
  customerCode: string | null;
  code: string | null;
  name: string | null;
  brand: string | null;
  uoM: string | null;
  [key: string]: unknown;
}

const RETRY = { retries: 2, minTimeout: 200, factor: 2 };

/**
 * Integration outbound ke ServiceMasterData — autentikasi Basic
 * (SERVICE_ACCOUNT) via whitelist basicAuthRoutes route internal materials.
 * Dipakai upload stock adjustment untuk lookup material by code.
 */
@injectable()
export class MasterDataService extends InternalService {
  constructor() {
    super(
      process.env.SERVICE_MASTER_DATA_URL ??
        SecretManager.env.SERVICE_MASTER_DATA_URL ??
        'http://',
    );
  }

  /**
   * GET /v1/materials/internal/by-code/:code — null jika tidak ditemukan.
   * Cache-aside Redis 1 jam (pola integrations ServiceBilling); null tidak
   * di-cache supaya material yang baru dibuat tidak kena stale miss.
   * Error downstream dibiarkan throw (bukan null) supaya caller membedakan
   * "material tidak ada" (422) vs "master-data down" (5xx).
   */
  public async getMaterialByCode(
    code: string,
    customerCode?: string | null,
  ): Promise<MasterMaterial | null> {
    this.headers['Authorization'] = `Basic ${this.basicAuthCredential}`;

    return this.request<MasterMaterial | null>({
      serviceName: 'master-data',
      config: {
        method: 'GET',
        url: `${this.url.replace(/\/$/, '')}/v1/materials/internal/by-code/${encodeURIComponent(code)}`,
        headers: this.headers,
        params: customerCode ? { customerCode } : undefined,
      },
      retry: RETRY,
      cache: {
        key: `master:material:${customerCode ?? 'all'}:${code}`,
        ttl: 3600,
        shouldSet: (data) => data !== null,
        coalesce: true,
      },
      mapResponse: (response) =>
        ((response.data as MasterEnvelope<MasterMaterial>)?.data ?? null),
    });
  }
}
