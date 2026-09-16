import { injectable } from 'inversify';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { RedisCache } from '@/integrations/thrid-party/redis.third';
import logger from '@/shared-libs/utils/logger.util';

/** Parity consumer.js (SELOG_WMS_Messaging) + hardening idempotency. */
const MAX_MESSAGES = 10;
const VISIBILITY_TIMEOUT = 30;
/** Long polling 20s: 1 request per 20 detik saat idle (vs spam tanpa jeda
 *  saat WaitTimeSeconds=0) — DNS lookup jadi jarang (ENOTFOUND di DNS
 *  korporat flaky jarang kena) + short polling bisa miss message. */
const WAIT_TIME_SECONDS = 20;
/** TTL klaim idempotensi — SQS at-least-once bisa redeliver >5 menit
 *  (visibility 30s x maxReceiveCount), jadi 5 menit in-memory legacy
 *  terlalu pendek. 24 jam menutup semua skenario redeliver. */
const DEFAULT_DEDUP_TTL_SECONDS = 24 * 60 * 60;

/** Umur klaim sebelum dianggap yatim — pemilik klaim crash (kill -9 /
 *  deploy restart) SEBELUM commit: transaksi DB rollback tapi klaim nyangkut
 *  sampai TTL. Tanpa deteksi ini, redeliver SQS dianggap duplikat lalu
 *  DI-DELETE → event hilang permanen. 10 menit ≫ waktu proses satu pesan
 *  (detik) — duplikat "asli" datang dalam detik-menit, tetap di-delete normal.
 *  Override: SQS_DEDUP_STALE_MINUTES. */
const DEFAULT_STALE_CLAIM_MS = 10 * 60 * 1000;

/** SQL/network transient — parity isTransientError consumer.js. */
const TRANSIENT_CODES = [
  'ETIMEOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'EREQUEST',
];
const TRANSIENT_SQL_NUMBERS = [1205, 49918, 49919, 49920];

export function isTransientSqlError(err: any): boolean {
  if (!err) return false;
  return (
    TRANSIENT_CODES.includes(err.code) ||
    TRANSIENT_SQL_NUMBERS.includes(err.number)
  );
}

/**
 * Error yang retry TIDAK akan memperbaiki (payload invalid, field key hilang).
 * Listener akan meng-DELETE pesan ini (poison protection) — beda dengan error
 * transient/unknown yang dibiarkan redeliver oleh SQS.
 */
export class PermanentMessageError extends Error {}

/** Umur klaim (ms) dari value ISO timestamp; null bila tak bisa diparse. */
export function claimAgeMs(value: string, now = Date.now()): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : now - t;
}

/**
 * Base SQS listener — pola BaseServiceBusListener (ServiceBilling), transport
 * SQS sesuai spec consumer.js legacy. Jaminan no-double:
 *
 * 1. IDEMPOTENCY DURABLE — klaim Redis SETNX (atomic, lintas instance, tahan
 *    restart) atas hash payload BISNIS. SQS at-least-once → pesan sama diproses
 *    sekali; duplikat di-delete tanpa dieksekusi.
 * 2. FAIL-CLOSED — Redis error → throw SEBELUM eksekusi → pesan tidak
 *    di-delete → redeliver (aman daripada dobel).
 * 3. FAIL-SAFE klaim — proses gagal → klaim dihapus → redeliver memproses
 *    ulang dari nol (tidak ada event yang hilang karena klaim nyangkut).
 *    Crash pemilik klaim (kill -9 / deploy restart) sebelum commit → klaim
 *    nyangkut tanpa yang menghapus → terdeteksi via umur klaim (stale) →
 *    dicuri (CAS atomic) → diproses ulang — event tidak hilang diam-diam.
 * 4. PermanentMessageError → pesan di-delete (payload rusak tidak akan
 *    membaik dengan retry — cegah poison loop).
 * 5. Double-insert row level dicegat DB: UQ_StockAvailability_Customer_
 *    Warehouse_Material. Lost-update dicegat tableHint UPDLOCK di transaksi
 *    (mssql MENGABAIKAN options.lock — dialect supports.lock=false).
 */
@injectable()
export abstract class BaseSqsListener {
  private client: SQSClient | null = null;
  private redis: Redis | null = null;
  private running = false;

  /** Nama queue SQS (bukan URL) — URL dibangun dari SQS_QUEUE_ID + region. */
  abstract readonly queueName: string;

  protected abstract processMessage(body: unknown): Promise<void>;

  /**
   * Kunci idempotensi dari RAW BODY. Default: sha256(body). Override bila
   * payload punya field yang berubah tiap publish (mis. LogId UUID) supaya
   * retry publisher tidak lolos sebagai pesan berbeda.
   */
  protected buildDedupKey(rawBody: string): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  private getDedupTtl(): number {
    const n = Number(process.env.SQS_DEDUP_TTL_SECONDS);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_DEDUP_TTL_SECONDS;
  }

  private getStaleClaimMs(): number {
    const n = Number(process.env.SQS_DEDUP_STALE_MINUTES);
    return Number.isFinite(n) && n > 0 ? n * 60 * 1000 : DEFAULT_STALE_CLAIM_MS;
  }

  private getRedis(): Redis {
    if (!this.redis) this.redis = RedisCache.getInstance();
    return this.redis;
  }

  protected getSqsClient(): SQSClient {
    if (!this.client) {
      this.client = new SQSClient({
        region: process.env.SQS_REGION,
        credentials: {
          accessKeyId: process.env.SQS_IAM_ACCESS_KEY ?? '',
          secretAccessKey: process.env.SQS_IAM_SECRET_KEY ?? '',
        },
      });
    }
    return this.client;
  }

  protected getQueueUrl(): string {
    return `https://sqs.${process.env.SQS_REGION}.amazonaws.com/${process.env.SQS_QUEUE_ID}/${this.queueName}`;
  }

  async startListening(): Promise<void> {
    if (this.running) return;
    if (!this.queueName || !process.env.SQS_QUEUE_ID) {
      logger.error(
        `SQS listener NOT started (${this.constructor.name}): queueName/SQS_QUEUE_ID kosong — cek .env`,
      );
      return;
    }
    this.running = true;
    logger.info(`Starting SQS listener on queue: ${this.queueName}`);
    this.pollLoop().catch((error) =>
      logger.error(
        `SQS listener ${this.queueName} crashed: ${(error as Error).message}`,
      ),
    );
  }

  async stopListening(): Promise<void> {
    this.running = false;
    logger.info(`Stopping SQS listener on queue: ${this.queueName}`);
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const data = await this.getSqsClient().send(
          new ReceiveMessageCommand({
            QueueUrl: this.getQueueUrl(),
            MaxNumberOfMessages: MAX_MESSAGES,
            VisibilityTimeout: VISIBILITY_TIMEOUT,
            WaitTimeSeconds: WAIT_TIME_SECONDS,
          }),
        );

        for (const message of data.Messages ?? []) {
          await this.handleRawMessage(
            message.Body ?? '',
            message.ReceiptHandle!,
          );
        }
      } catch (error) {
        logger.error(
          `Error receiving from ${this.queueName}: ${(error as Error).message}`,
        );
        await this.sleep(1000);
      }
    }
  }

  private async handleRawMessage(rawBody: string, receiptHandle: string) {
    // === Klaim idempotensi (atomic SETNX; klaim yatim dicuri) ===
    const key = `sqs:dedup:${this.queueName}:${this.buildDedupKey(rawBody)}`;
    const claimTs = new Date().toISOString();
    let owned = false;
    try {
      owned =
        (await this.getRedis().set(key, claimTs, 'EX', this.getDedupTtl(), 'NX')) ===
          'OK' || (await this.stealStaleClaim(key, claimTs));
    } catch (error) {
      // FAIL-CLOSED: tanpa klaim, jangan eksekusi — biarkan redeliver.
      logger.error(
        `Dedup claim failed (Redis). Message not processed: ${(error as Error).message}`,
      );
      return;
    }

    if (!owned) {
      logger.warn(`Duplicate SQS message (dedup hit). Deleting: ${key}`);
      await this.deleteMessage(receiptHandle);
      return;
    }

    try {
      await this.processMessage(JSON.parse(rawBody));
      await this.deleteMessage(receiptHandle);
      logger.info(`SQS message processed and deleted: ${key.slice(-12)}`);
    } catch (error) {
      // Bebaskan klaim supaya redeliver diproses ulang, bukan dianggap dup.
      await this.getRedis().del(key).catch(() => undefined);

      if (error instanceof PermanentMessageError) {
        // Payload rusak — retry tidak membantu; hapus agar tidak poison-loop.
        logger.error({
          message: `SQS permanent failure — message DELETED: ${key.slice(-12)}`,
          error: error.message,
        });
        await this.deleteMessage(receiptHandle);
        return;
      }

      // Tidak di-delete → SQS redeliver setelah visibility timeout (retry).
      logger.error({
        message: `SQS message processing failed (will redeliver): ${key.slice(-12)}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Curi klaim yatim. CAS via Lua → dua instance tidak bisa mencuri
   * bersamaan; yang kalah diperlakukan sebagai duplikat biasa.
   */
  private async stealStaleClaim(key: string, newTs: string): Promise<boolean> {
    const redis = this.getRedis();
    const current = await redis.get(key);

    if (current === null) {
      // Klaim expire di antara SETNX-nil dan GET → klaim ulang via NX
      // (race aman: instance lain mungkin lebih dulu → kita kalah fair).
      return (
        (await redis.set(key, newTs, 'EX', this.getDedupTtl(), 'NX')) === 'OK'
      );
    }

    const age = claimAgeMs(current);
    if (age === null || age <= this.getStaleClaimMs()) return false;

    const stolen = (await redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then
         redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
         return 1
       end
       return 0`,
      1,
      key,
      current,
      newTs,
      String(this.getDedupTtl()),
    )) as number;

    if (stolen === 1) {
      logger.warn(
        `Stale dedup claim stolen (owner crashed pre-commit): ${key.slice(-12)}`,
      );
    }
    return stolen === 1;
  }

  private async deleteMessage(receiptHandle: string) {
    await this.getSqsClient().send(
      new DeleteMessageCommand({
        QueueUrl: this.getQueueUrl(),
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
