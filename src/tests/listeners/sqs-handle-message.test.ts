import assert from 'node:assert/strict';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { BaseSqsListener } from '@/listeners/base-sqs-listener';

/** Fake Redis — hanya operasi yang dipakai dedup (SET NX / GET / DEL / EVAL). */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async set(key: string, val: string, _ex: string, _ttl: number, nx: string) {
      if (nx === 'NX' && store.has(key)) return null;
      store.set(key, val);
      return 'OK';
    },
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    async eval() {
      return 0;
    },
  };
}

/** Fake SQS client — catat delete; bisa dibuat melempar N kali pertama. */
function fakeSqs(deleteFailures = 0) {
  const deleted: string[] = [];
  let failuresLeft = deleteFailures;
  return {
    deleted,
    async send(cmd: any) {
      if (cmd instanceof ReceiveMessageCommand) return { Messages: [] };
      if (cmd instanceof DeleteMessageCommand) {
        if (failuresLeft-- > 0) throw new Error('simulated delete failure');
        deleted.push(cmd.input.ReceiptHandle);
        return {};
      }
      return {};
    },
  };
}

class TestListener extends BaseSqsListener {
  readonly queueName = 'test-queue';
  processed: string[] = [];
  failNext = false;
  constructor(sqs: ReturnType<typeof fakeSqs>, redis: ReturnType<typeof fakeRedis>) {
    super();
    (this as any).client = sqs;
    (this as any).redis = redis;
  }
  protected async processMessage(body: any): Promise<void> {
    this.processed.push(body?.id ?? JSON.stringify(body));
    if (this.failNext) {
      this.failNext = false;
      throw new Error('transient boom');
    }
  }
}

const handle = (l: TestListener, raw: string, rh = `rh-${Math.random()}`) =>
  (l as any).handleRawMessage(raw, rh);
const claimCount = (redis: ReturnType<typeof fakeRedis>) => redis.store.size;

describe('BaseSqsListener.handleRawMessage (aman: no double-apply / no poison loop)', () => {
  it('sukses → klaim DIPERTAHANKAN (redeliver dedup-hit, tidak dobel-apply)', async () => {
    const sqs = fakeSqs();
    const redis = fakeRedis();
    const listener = new TestListener(sqs, redis);
    const raw = JSON.stringify({ id: 'e1', qty: 5 });

    await handle(listener, raw, 'rh-1');
    // delete sukses, proses sekali, klaim masih ada (bukan di-del)
    assert.equal(listener.processed.length, 1);
    assert.equal(sqs.deleted.length, 1);
    assert.equal(claimCount(redis), 1, 'klaim harus tetap ada setelah sukses');

    // redeliver (SQS at-least-once) → duplikat → di-delete TANPA proses ulang
    await handle(listener, raw, 'rh-2');
    assert.equal(listener.processed.length, 1, 'duplikat tidak boleh diproses');
    assert.equal(sqs.deleted.length, 2);
  });

  it('delete GAGAL setelah proses sukses → klaim tetap ada → redeliver dedup-hit → delete ulang (qty tidak dobel)', async () => {
    const sqs = fakeSqs(1); // delete pertama gagal
    const redis = fakeRedis();
    const listener = new TestListener(sqs, redis);
    const raw = JSON.stringify({ id: 'e2', qty: 7 });

    // delete throw sengaja dibiarkan propagate ke pollLoop (di-log, loop lanjut)
    await assert.rejects(handle(listener, raw, 'rh-1'), /simulated delete failure/);
    assert.equal(listener.processed.length, 1);
    assert.equal(claimCount(redis), 1, 'klaim TIDAK boleh dibebaskan saat sukses');

    await handle(listener, raw, 'rh-1'); // redeliver: dedup-hit → delete ulang
    assert.equal(listener.processed.length, 1, 'event yang sudah commit tidak boleh diproses lagi');
    assert.equal(sqs.deleted.length, 1);
  });

  it('proses gagal (transient) → klaim dibebaskan → redeliver DIPROSES ulang', async () => {
    const sqs = fakeSqs();
    const redis = fakeRedis();
    const listener = new TestListener(sqs, redis);
    listener.failNext = true;
    const raw = JSON.stringify({ id: 'e3', qty: 1 });

    await handle(listener, raw, 'rh-1');
    assert.equal(claimCount(redis), 0, 'klaim dibebaskan supaya bisa retry');
    assert.equal(sqs.deleted.length, 0, 'tidak di-delete → SQS redeliver');

    await handle(listener, raw, 'rh-1'); // retry sukses
    assert.equal(listener.processed.length, 2, 'diproses ulang dari nol');
    assert.equal(sqs.deleted.length, 1);
  });

  it('body bukan JSON valid → PermanentMessageError → di-delete (bukan poison loop)', async () => {
    const sqs = fakeSqs();
    const listener = new TestListener(sqs, fakeRedis());

    await handle(listener, '<<<not-json>>>', 'rh-1');
    assert.equal(listener.processed.length, 0);
    assert.equal(sqs.deleted.length, 1, 'poison message harus di-delete');
  });
});
