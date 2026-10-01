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

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: Health check endpoints
 */
@controller('/v1/health')
export class HealthController extends BaseHttpController {
  constructor(@inject(QueryService) private readonly query: QueryService) {
    super();
  }

  /**
   * @swagger
   * /v1/health:
   *   get:
   *     summary: Self check — proses hidup = healthy
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Service is healthy
   */
  @httpGet('/')
  async self() {
    return { httpCode: 200, data: null };
  }

  /**
   * @swagger
   * /v1/health/sql:
   *   get:
   *     summary: SQL Server health check
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: SQL Server is healthy
   *       503:
   *         description: SQL Server is unhealthy
   */
  @httpGet('/sql')
  async sql() {
    const entry = await this.query.checkSql();
    if (entry.status === 'Unhealthy') return failureResponse([entry]);
    return { httpCode: 200, data: [entry] };
  }

  /**
   * @swagger
   * /v1/health/sqs:
   *   get:
   *     summary: SQS health check
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: SQS is healthy
   *       503:
   *         description: SQS is unhealthy
   */
  @httpGet('/sqs')
  async sqs() {
    const entry = await this.query.checkSqs();
    if (entry.status === 'Unhealthy') return failureResponse([entry]);
    return { httpCode: 200, data: [entry] };
  }

  /**
   * @swagger
   * /v1/health/redis:
   *   get:
   *     summary: Redis health check
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Redis is healthy
   *       503:
   *         description: Redis is unhealthy
   */
  @httpGet('/redis')
  async redis() {
    const entry = await this.query.checkRedis();
    if (entry.status === 'Unhealthy') return failureResponse([entry]);
    return { httpCode: 200, data: [entry] };
  }
}
