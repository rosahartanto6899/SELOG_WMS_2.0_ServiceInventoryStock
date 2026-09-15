import { TokenEncryption } from '@/shared-libs/utils';
import SecretManager from '@/shared-libs/utils/secret-manager.util';
import {
  executeOutboundRequest,
  OutboundRequestOptions,
} from '@/shared-libs/utils/outbound';

class InternalService {
  protected readonly timeout = 1000 * 10;
  protected url: string;
  protected headers: any = {
    'Content-Type': 'application/json',
  };
  protected basicAuthCredential: string;

  constructor(serviceUrl: string) {
    this.url = serviceUrl;
    if (process.env.IS_NON_CLUSTER) {
      this.headers = {
        ...this.headers,
        'x-api-key': SecretManager.env.APIG_KEY ?? '',
      };
      this.url = this._handleUrl(this.url);
    }
    this.basicAuthCredential = this._handleBasicAuthCredential();
  }

  protected _handleUrl(url: string): string {
    const apigUrl = SecretManager.env.APIG_URL ?? '';
    const explodeUrl = url.split('-');
    const serviceName = explodeUrl[2];

    if (!apigUrl || !serviceName) {
      return url;
    }

    return apigUrl.replace('*', serviceName);
  }

  protected _handleBasicAuthCredential(): string {
    const username =
      SecretManager.env.BASIC_AUTH_USER ??
      process.env.BASIC_AUTH_USER ??
      'fallbackFalseUsername'; // fallback to let validation failed on purpose

    const password =
      SecretManager.env.BASIC_AUTH_PASS ??
      process.env.BASIC_AUTH_PASS ??
      'fallbackFalsePass'; // fallback to let validation failed on purpose

    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
    const encryptedBasicAuth = TokenEncryption.encrypt(basicAuth);
    return encryptedBasicAuth;
  }

  /** Outbound pipeline (timeout/retry/cache/breaker opt-in) dengan default
   *  logger hooks — endpoint untuk method di subclass (README outbound). */
  protected request<T>(options: OutboundRequestOptions<T>): Promise<T> {
    return executeOutboundRequest<T>(options);
  }
}

export default InternalService;
