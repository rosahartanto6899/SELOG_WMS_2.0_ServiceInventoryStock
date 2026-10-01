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
/** Long polling 20s: 1 request per 20s when idle (vs nonstop spam when
 *  WaitTimeSeconds=0) — DNS lookups become rare (ENOTFOUND on flaky
 *  corporate DNS rarely hit) + short polling can miss messages. */
const WAIT_TIME_SECONDS = 20;
/** Idempotency claim TTL — SQS at-least-once can redeliver >5 minutes later
 *  (visibility 30s x maxReceiveCount), so the legacy 5-minute in-memory
 *  window is too short. 24 hours covers all redelivery scenarios. */
const DEFAULT_DEDUP_TTL_SECONDS = 24 * 60 * 60;

/** Claim age before it is considered orphaned — claim owner crashes
 *  (kill -9 / deploy restart) BEFORE commit: DB transaction rolls back but
 *  the claim sticks until TTL. Without this detection, an SQS redelivery is
 *  treated as a duplicate and then DELETED → event lost forever. 10 minutes
 *  ≫ time to process one message (seconds) — "real" duplicates arrive within
 *  seconds-to-minutes and are still deleted normally.
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
 * Error that retrying will NOT fix (invalid payload, missing key fields).
 * The listener DELETEs such messages (poison protection) — unlike
 * transient/unknown errors which are left for SQS to redeliver.
 */
export class PermanentMessageError extends Error {}

/** Claim age (ms) from an ISO timestamp value; null if unparseable. */
export function claimAgeMs(value: string, now = Date.now()): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : now - t;
}

/** A body that is not valid JSON can never be processed — mapped to
 *  PermanentMessageError so it is deleted, not redelivered forever. */
function parseBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new PermanentMessageError(
      `Body is not valid JSON: ${rawBody.slice(0, 200)}`,
    );
  }
}

/**
 * Base SQS listener — BaseServiceBusListener pattern (ServiceBilling), SQS
 * transport per legacy consumer.js spec. No-double guarantees:
 *
 * 1. DURABLE IDEMPOTENCY — Redis SETNX claim (atomic, cross-instance,
 *    restart-safe) over a hash of the BUSINESS payload. SQS at-least-once →
 *    the same message is processed once; duplicates are deleted unexecuted.
 * 2. FAIL-CLOSED — Redis error → throw BEFORE executing → message is not
 *    deleted → redelivered (safe rather than doubled).
 * 3. FAIL-SAFE claim — processing fails → claim deleted → redelivery
 *    processes from scratch (no event lost to a stuck claim). Claim owner
 *    crashes (kill -9 / deploy restart) before commit → claim sticks with
 *    nobody to delete it → detected via claim age (stale) → stolen (atomic
 *    CAS) → reprocessed — no event silently lost.
 * 4. PermanentMessageError → message deleted (a broken payload won't heal
 *    by retrying — prevents poison loops).
 * 5. Row-level double inserts are blocked by the DB: UQ_StockAvailability_
 *    Customer_Warehouse_Material. Lost updates are blocked by the UPDLOCK
 *    table hint inside the transaction (mssql IGNORES options.lock —
 *    dialect supports.lock=false).
 */
@injectable()
export abstract class BaseSqsListener {
  private client: SQSClient | null = null;
  private redis: Redis | null = null;
  private running = false;
  /** Active pollLoop promise — stopListening awaits it so in-flight batches
   *  and the last long poll finish before the process exits (drain). */
  private pollPromise: Promise<void> | null = null;

  /** SQS queue name (not URL) — the URL is built from SQS_QUEUE_ID + region. */
  abstract readonly queueName: string;

  protected abstract processMessage(body: unknown): Promise<void>;

  /**
   * Idempotency key from the RAW BODY. Default: sha256(body) — catches SQS
   * redeliveries (byte-identical body). Do NOT strip per-event fields
   * (e.g. LogId) to "catch publisher retries": distinct legitimate events
   * with identical business payload then collide and get dropped.
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
    this.pollPromise = this.pollLoop().catch((error) =>
      logger.error(
        `SQS listener ${this.queueName} crashed: ${(error as Error).message}`,
      ),
    );
  }

  async stopListening(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    logger.info(`Stopping SQS listener on queue: ${this.queueName}`);
    // Drain: the last long poll (≤20s) + already-received messages finish
    // first; only stop fetching new batches. SIGTERM grace of 30s suffices.
    await this.pollPromise;
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
    // === Idempotency claim (atomic SETNX; orphaned claims get stolen) ===
    const key = `sqs:dedup:${this.queueName}:${this.buildDedupKey(rawBody)}`;
    const claimTs = new Date().toISOString();
    let owned = false;
    try {
      owned =
        (await this.getRedis().set(key, claimTs, 'EX', this.getDedupTtl(), 'NX')) ===
          'OK' || (await this.stealStaleClaim(key, claimTs));
    } catch (error) {
      // FAIL-CLOSED: without a claim, don't execute — let it redeliver.
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
      await this.processMessage(parseBody(rawBody));
    } catch (error) {
      // Processing FAILED → release the claim so the redelivery is
      // reprocessed, not treated as a duplicate.
      await this.getRedis().del(key).catch(() => undefined);

      if (error instanceof PermanentMessageError) {
        // Broken payload — retrying won't help; delete to avoid a poison loop.
        logger.error({
          message: `SQS permanent failure — message DELETED: ${key.slice(-12)}`,
          error: error.message,
        });
        await this.deleteMessage(receiptHandle);
        return;
      }

      // Not deleted → SQS redelivers after the visibility timeout (retry).
      logger.error({
        message: `SQS message processing failed (will redeliver): ${key.slice(-12)}`,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Processing SUCCEEDED → the claim is KEPT (TTL cleans it up).
    // If DeleteMessage fails, the next redelivery dedup-hits and is deleted
    // again — never double-applied. (Deleting the claim here would make a
    // redelivery reprocess an already-committed event.)
    await this.deleteMessage(receiptHandle);
    logger.info({
      message: `SQS message processed and deleted: ${key.slice(-12)}`,
      payload: parseBody(rawBody),
    });
  }

  /**
   * Steal an orphaned claim. CAS via Lua → two instances cannot steal
   * simultaneously; the loser is treated as an ordinary duplicate.
   */
  private async stealStaleClaim(key: string, newTs: string): Promise<boolean> {
    const redis = this.getRedis();
    const current = await redis.get(key);

    if (current === null) {
      // Claim expired between failed SETNX and GET → re-claim via NX
      // (race-safe: another instance may win first → we fairly lose).
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
