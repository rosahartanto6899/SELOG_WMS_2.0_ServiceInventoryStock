import { failureResponse } from '@/features/v1/health/health.controller';

describe('healthcheck failure envelope', () => {
  it('returns 503 with transactionId/code/eTag/data paritas ResponseJson', () => {
    const res: any = failureResponse([
      {
        component: 'sqlserver',
        status: 'Unhealthy',
        description: 'Service Unhealthy',
        error: 'boom',
      },
    ]);

    expect(res.httpCode).toBe(503);
    expect(res.data.code).toBe('SUCCESS-HEALTHCHECK-0001');
    expect(res.data.message).toBe('Service Unhealthy');
    expect(res.data.transactionId).toEqual(
      expect.any(String) /* uuid */,
    );
    expect(res.data.eTag).toBe(
      require('node:crypto')
        .createHash('md5')
        .update(res.data.transactionId)
        .digest('hex'),
    );
    expect(res.data.data[0]).toMatchObject({
      component: 'sqlserver',
      status: 'Unhealthy',
      error: 'boom',
    });
  });
});
