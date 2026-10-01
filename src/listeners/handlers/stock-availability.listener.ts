import { injectable } from 'inversify';
import { FindOptions, TableHints, Transaction, WhereOptions } from 'sequelize';
import { BaseSqsListener, PermanentMessageError } from '../base-sqs-listener';
import {
  StockAvailabilitySqsMessage,
  StockAvailabilitySqsRow,
  insertQty,
  logDelta,
  transactionType,
  upsertDelta,
} from '../constants/stock-availability-action.constant';
import {
  StockAvailability,
  StockAvailabilityLog,
} from '@/database/entities';
import { UniqueIdGenerator } from '@/shared-libs/utils/unique-id-generator.util';
import { nowWib, sequelize } from '@/utils';

/**
 * SQS listener for queue inventorystock-stockavailability — parity with
 * consumer.js (SELOG_WMS_Messaging) + SP usp_LogStockAvailability then
 * usp_InsertUpdateStockAvailability (definitions verified from the dev DB).
 * Ported to Sequelize in ONE transaction: logs use the pre-update qty,
 * then upsert grouped per natural key — net effect identical to the
 * two legacy SPs' order (see specs/stock-availability-sqs-listener_reverse_spec.md).
 */
@injectable()
export class StockAvailabilityListener extends BaseSqsListener {
  readonly queueName = process.env.SQS_QUEUE_INVENTORY_STOCK ?? '';

  // No buildDedupKey override: LogId is the ONLY per-event-unique field —
  // stripping it made two legit identical binnings (10 + 10) collide into
  // one claim and the second was dropped as a "duplicate". Default hash of
  // the full body still dedups SQS redeliveries (byte-identical body).

  async processMessage(body: unknown): Promise<void> {
    const message = body as StockAvailabilitySqsMessage;
    const rows = message?.StockAvailabilityDtos;

    // Permanent validation — retrying won't fix a broken payload.
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new PermanentMessageError('StockAvailabilityDtos is empty');
    }
    if (!message.ActionType || typeof message.ActionType !== 'string') {
      throw new PermanentMessageError(`Invalid ActionType: ${message.ActionType}`);
    }
    const userBy = message.UserBy;
    if (!userBy || typeof userBy !== 'string') {
      throw new PermanentMessageError(`Invalid UserBy: ${message.UserBy}`);
    }
    // Natural key fields are required — NULL sneaking past the UQ check can
    // poison-loop (NULL-key insert fails repeatedly, never becomes an
    // update path).
    rows.forEach((row, i) => {
      if (!row.CustomerCode || !row.WarehouseCode || !row.MaterialCode) {
        throw new PermanentMessageError(
          `Row ${i}: CustomerCode/WarehouseCode/MaterialCode wajib ada`,
        );
      }
    });

    await sequelize.transaction(async (transaction: Transaction) => {
      // === SP 1: usp_LogStockAvailability — per ROW, qty before the update ===
      await this.insertLogs(rows, message.ActionType, userBy, transaction);

      // === SP 2: usp_InsertUpdateStockAvailability — grouped MERGE ===
      await this.mergeStock(rows, message.ActionType, userBy, transaction);
    });
  }

  private async insertLogs(
    rows: StockAvailabilitySqsRow[],
    actionType: string,
    userBy: string,
    transaction: Transaction,
  ): Promise<void> {
    const logRows = [];

    for (const row of rows) {
      const stock = await this.findStock(row, transaction, true);
      const before = Number(stock?.get('qtySOH') ?? 0);
      const qty = Number(row.QtySOH ?? 0);
      const delta = logDelta(actionType);
      const after =
        delta === 'plus' ? before + qty : delta === 'minus' ? before - qty : before;

      logRows.push({
        id: UniqueIdGenerator.generate(),
        customerCode: row.CustomerCode ?? null,
        customerName: row.CustomerName ?? null,
        warehouseCode: row.WarehouseCode ?? null,
        warehouseName: row.WarehouseName ?? null,
        deliveryNoteNo: row.DeliveryNoteNo ?? null,
        transactionType: transactionType(actionType),
        poDate: row.PODate ? new Date(row.PODate) : null,
        materialCode: row.MaterialCode ?? null,
        materialName: row.MaterialName ?? null,
        materialBrand: row.MaterialBrand ?? null,
        uom: row.UoM ?? null,
        qtySOHBefore: before,
        qtySOHAfter: after,
        description: row.Description ?? null,
        createdBy: userBy,
        createdDate: nowWib(),
      });
    }

    await StockAvailabilityLog.bulkCreate(logRows, { transaction });
  }

  private async mergeStock(
    rows: StockAvailabilitySqsRow[],
    actionType: string,
    userBy: string,
    transaction: Transaction,
  ): Promise<void> {
    // GROUP BY natural key + name/brand/uom, SUM(QtySOH) — parity @TempStock
    const grouped = new Map<string, { row: StockAvailabilitySqsRow; qty: number }>();
    for (const row of rows) {
      const key = [
        row.CustomerCode, row.WarehouseCode, row.MaterialCode,
        row.MaterialName, row.MaterialBrand, row.UoM,
      ].join('|');
      const existing = grouped.get(key);
      if (existing) existing.qty += Number(row.QtySOH ?? 0);
      else grouped.set(key, { row, qty: Number(row.QtySOH ?? 0) });
    }

    const delta = upsertDelta(actionType);

    for (const { row, qty } of grouped.values()) {
      const stock = await this.findStock(row, transaction, true);

      if (stock) {
        if (delta === 'none') continue; // ELSE COALESCE(SA.QtySOH,0) — no-op
        const before = Number(stock.get('qtySOH') ?? 0);
        await StockAvailability.update(
          {
            qtySOH: delta === 'plus' ? before + qty : before - qty,
            modifiedBy: userBy,
            modifiedDate: nowWib(),
          },
          { where: { id: stock.get('id') as string }, transaction },
        );
      } else {
        await StockAvailability.create(
          {
            id: UniqueIdGenerator.generate(),
            customerCode: row.CustomerCode ?? null,
            customerName: row.CustomerName ?? null,
            warehouseCode: row.WarehouseCode ?? null,
            warehouseName: row.WarehouseName ?? null,
            materialCode: row.MaterialCode ?? null,
            materialName: row.MaterialName ?? null,
            materialBrand: row.MaterialBrand ?? null,
            uom: row.UoM ?? null,
            qtySOH: insertQty(actionType, qty),
            // parity with SP insert: QtyPlan* not set (NULL), Modified* set
            qtyPlanIncoming: null,
            qtyPlanOutgoing: null,
            isActive: true,
            createdBy: userBy,
            createdDate: nowWib(),
            modifiedBy: userBy,
            modifiedDate: nowWib(),
            deletedDate: null,
            deletedBy: null,
          },
          { transaction },
        );
      }
    }
  }

  private async findStock(
    row: StockAvailabilitySqsRow,
    transaction: Transaction,
    lock = false,
  ) {
    const where: WhereOptions = {
      customerCode: row.CustomerCode ?? null,
      warehouseCode: row.WarehouseCode ?? null,
      materialCode: row.MaterialCode ?? null,
      isActive: true, // parity MERGE ON SA.IsActive = 1
      deletedDate: null,
    };
    const options: FindOptions = { where, transaction };
    if (lock && transaction) {
      // Sequelize mssql IGNORES options.lock (dialect supports.lock=false)
      // → plain SELECT → concurrent read-modify-write = lost update (wrong
      // qty). tableHint renders WITH (UPDLOCK) — per-row RMW is serialized;
      // insert races are still blocked by the DB UQ.
      (options as { tableHint?: TableHints }).tableHint = TableHints.UPDLOCK;
    }
    return StockAvailability.findOne(options);
  }
}
