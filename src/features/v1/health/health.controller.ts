import { createHash, randomUUID } from 'node:crypto';
import { inject } from 'inversify';
import {
  BaseHttpController,
  controller,
  httpGet,
} from 'inversify-express-utils';
import { QueryService } from './query.service';

/** Envelope manual untuk status non-2xx — ResponseJson hanya wrap 2xx,
 *  paritas bentuk respons dengan middleware (lihat response-json.middleware.ts). */
export const failureResponse = (entries: unknown[]) => {
  const transactionId = randomUUID();
  return {
    httpCode: 503,
    data: {
      transactionId,
      code: 'SUCCESS-HEALTHCHECK-0001',
      message: 'Service Unhealthy',
      eTag: createHash('md5').update(transactionId).digest('hex'),
      data: entries,
    },
  };
};

@controller('/v1/health')
export class HealthController extends BaseHttpController {
  constructor(@inject(QueryService) private readonly query: QueryService) {
    super();
  }

  /** Self check — proses hidup = healthy (paritas check "self" WMS_Incoming). */
  @httpGet('/')
  async self() {
    return { httpCode: 200, data: null };
  }

  /** SQL Server check. */
  @httpGet('/sql')
  async sql() {
    const entry = await this.query.checkSql();
    if (entry.status === 'Unhealthy') return failureResponse([entry]);
    return { httpCode: 200, data: [entry] };
  }

  /** SQS check. */
  @httpGet('/sqs')
  async sqs() {
    const entry = await this.query.checkSqs();
    if (entry.status === 'Unhealthy') return failureResponse([entry]);
    return { httpCode: 200, data: [entry] };
  }
}
