import Redis from 'ioredis';
import { default as SecretManager } from '@/shared-libs/utils/secret-manager.util';

export class RedisCache {
  private static redis: Redis;

  public static getInstance(): Redis {
    const redisHost = SecretManager.env.REDIS_HOST;
    const redisPort = parseInt(SecretManager.env.REDIS_PORT || '6379', 10); // Default to 6379 if not provided
    const redisDb = parseInt(SecretManager.env.REDIS_DB || '0', 10); // Default to DB 0 if not provided
    const redisPassword = SecretManager.env.REDIS_PASSWORD || undefined;

    if (!redisHost) {
      throw new Error('REDIS_HOST environment variable is required');
    }

    // Creating Redis connection only if it does not exist
    if (!RedisCache.redis) {
      // TLS hanya untuk Redis ter-encrypt (Azure 6380 / REDIS_TLS=true);
      // Redis lokal dev (127.0.0.1:6379) plain TCP — TLS-paksa bikin koneksi
      // hang tanpa error → semua request yang lewat cache (auth) menggantung.
      const useTls =
        SecretManager.env.REDIS_TLS === 'true' || redisPort === 6380;
      RedisCache.redis = new Redis({
        host: redisHost,
        port: redisPort,
        db: redisDb,
        // username: redisUsername, // Will be undefined if not provided
        password: redisPassword, // Will be undefined if not provided
        ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
      });
    }

    RedisCache.redis.on('error', (err) => {
      console.error('Redis error:', err);
    });

    return RedisCache.redis;
  }

  // Set a value in Redis with optional TTL (time-to-live)
  async set(key: string, value: unknown, ttl: number = 3600): Promise<void> {
    const redis = RedisCache.getInstance();
    const serializedValue = JSON.stringify(value);
    await redis.set(key, serializedValue, 'EX', ttl);
  }

  // Select a different Redis database
  async selectDb(dbNumber: number): Promise<void> {
    const redis = RedisCache.getInstance();
    await redis.select(dbNumber);
  }

  // Get a value from Redis and deserialize it
  async get<T>(key: string): Promise<T | null> {
    const redis = RedisCache.getInstance();
    const cachedValue = await redis.get(key);
    return cachedValue ? (JSON.parse(cachedValue) as T) : null;
  }

  // Delete a key from Redis
  async delete(key: string): Promise<void> {
    const redis = RedisCache.getInstance();
    await redis.del(key);
  }

  async deleteKeysByPattern(pattern: string): Promise<void> {
    const redis = RedisCache.getInstance();
    const stream = redis.scanStream({
      match: pattern,
      count: 100, // Jumlah kunci yang diproses per iterasi
    });

    const pipeline = redis.pipeline();
    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        keys.forEach((key) => pipeline.del(key));
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        pipeline
          .exec()
          .then(() => resolve())
          .catch((err) => reject(new Error(err)));
      });
      stream.on('error', (err) =>
        reject(new Error('Redis error: ' + err.message))
      );
    });
  }

  // Flush all data in the current Redis database
  async flushAll(): Promise<void> {
    const redis = RedisCache.getInstance();
    await redis.flushall();
  }
}
