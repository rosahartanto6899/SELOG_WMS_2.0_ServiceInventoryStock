import { injectable } from 'inversify';
import { FindOptions, TableHints, Transaction } from 'sequelize';
import {
  StockAvailability,
  StockAvailabilityLog,
} from '@/database/entities';
import {
  StockAvailabilityAttributes,
  StockAvailabilityLogAttributes,
} from '@/database/attributes';

/** CRUD StockAvailability + insert StockAvailabilityLog — pengganti SP
 *  usp_InsertStockAdjustmentByFileName (tabel existing, id varchar(36)
 *  tanpa default DB → id digenerate aplikasi). */
@injectable()
export class StockAdjustmentRepository {
  public async getStock(
    customerCode: string,
    warehouseCode: string,
    materialCode: string,
    transaction?: Transaction,
    lock = false,
  ) {
    const options: FindOptions = {
      where: { customerCode, warehouseCode, materialCode, deletedDate: null },
      transaction,
    };
    if (lock && transaction) {
      // options.lock DIABAIKAN Sequelize mssql (supports.lock=false) —
      // tableHint UPDLOCK satu-satunya cara render WITH (UPDLOCK):
      // serialisasi vs listener SQS yang menulis baris sama.
      (options as { tableHint?: TableHints }).tableHint = TableHints.UPDLOCK;
    }
    return StockAvailability.findOne(options);
  }

  /** Master material — kini via integration outbound ServiceMasterData
   *  (lihat integrations/api/materials), bukan tabel lokal. */

  public async createStock(
    data: StockAvailabilityAttributes,
    transaction?: Transaction,
  ) {
    return StockAvailability.create(data, { transaction });
  }

  public async updateStock(
    id: string,
    data: Partial<StockAvailabilityAttributes>,
    transaction?: Transaction,
  ) {
    await StockAvailability.update(data, {
      where: { id },
      transaction,
    });
  }

  public async createLog(
    data: StockAvailabilityLogAttributes,
    transaction?: Transaction,
  ) {
    return StockAvailabilityLog.create(data, { transaction });
  }
}
