import express from 'express';
import request from 'supertest';
import SecretManager from '@/shared-libs/utils/secret-manager.util';
import { RedisCache } from '@/integrations/thrid-party/redis.third';
import {
  RateLimitMiddleware,
  UserRateLimitMiddleware,
} from '@/shared-libs/middlewares/rate-limit.middleware';

/**
 * Butuh Redis nyata (sliding window-nya Lua di Redis).
 * Set RATELIMIT_TEST_REDIS_HOST, contoh: docker run -p 6399:6379 redis:alpine
 */
const REDIS_HOST = process.env.RATELIMIT_TEST_REDIS_HOST;

const maybe = REDIS_HOST ? describe : describe.skip;

maybe('RateLimitMiddleware (Redis)', () => {
  beforeAll(async () => {
    (SecretManager as any).env = { REDIS_HOST, REDIS_PORT: '6399' };
    RedisCache.getInstance();
  });

  beforeEach(async () => {
    await RedisCache.getInstance().flushall();
  });

  function buildApp() {
    const app = express();
    app.use(RateLimitMiddleware);
    app.use((req: any, _res: any, next: any) => {
      req.user = { tokenUserId: String(req.headers['x-user']) }; // fake VerifyJWT
      next();
    });
    app.use(UserRateLimitMiddleware);
    app.get(/.*/, (_req: any, res: any) => res.status(200).json({ ok: true }));
    return app;
  }

  async function burst(app: express.Express, user: string, n: number, path = '/x') {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push((await request(app).get(path).set('x-user', user)).status);
    }
    return out;
  }

  jest.setTimeout(15000);

  it('per-user: 5x200 lalu 429; user lain bucket sendiri; global tier kena setelah 12', async () => {
    const app = buildApp(); // butuh env run: RATE_LIMIT_MAX=5 RATE_LIMIT_GLOBAL_MAX=12
    const u1 = await burst(app, 'u1', 6);
    expect(u1).toEqual([200, 200, 200, 200, 200, 429]);

    const u2 = await burst(app, 'u2', 6);
    expect(u2).toEqual([200, 200, 200, 200, 200, 429]); // bucket user terpisah

    const u3 = await burst(app, 'u3', 3);
    // request yang ditolak tier user tetap terhitung di tier global (by design):
    // u1(6) + u2(6) = 12 habis → u3 langsung 429
    expect(u3).toEqual([429, 429, 429]);
  });

  it('window geser: lolos lagi setelah 1 detik', async () => {
    const app = buildApp();
    const first = await burst(app, 'sliding', 5, '/slide');
    expect(first.every((s) => s === 200)).toBe(true);
    expect((await burst(app, 'sliding', 1, '/slide'))[0]).toBe(429);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await burst(app, 'sliding', 1, '/slide'))[0]).toBe(200);
  });

  it('fail-open: Redis error tidak menolak request', async () => {
    (SecretManager as any).env = { REDIS_HOST: '127.0.0.1', REDIS_PORT: '6999' }; // port mati
    (RedisCache as any).redis = undefined; // paksa koneksi baru gagal
    const app = buildApp();
    const r = await request(app).get('/x').set('x-user', 'no-redis');
    expect(r.status).toBe(200); // fail-open: diizinkan, tidak crash
  });
});
