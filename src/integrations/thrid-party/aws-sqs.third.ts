import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

/**
 * Payload parity CoreApp `StockAvailabilityFinalDto` (System.Text.Json — key
 * PascalCase) + `StockAvailabilityDto`. ActionType 'WHSIN2' = tambah qtySOH
 * dari proses binning incoming.
 */
export interface StockAvailabilityMessage {
  ID?: number | null;
  CustomerCode?: string | null;
  CustomerName?: string | null;
  DeliveryNoteNo?: string | null;
  POType?: string | null;
  PODate?: string | null;
  WarehouseCode?: string | null;
  WarehouseName?: string | null;
  MaterialCode?: string | null;
  MaterialName?: string | null;
  MaterialBrand?: string | null;
  UoM?: string | null;
  QtyPlanIncoming?: number;
  QtyPlanOutgoing?: number;
  QtySOH?: number;
  QtyAvailable?: number;
}

interface StockAvailabilityFinalMessage {
  StockAvailabilityDtos: StockAvailabilityMessage[];
  ActionType: string;
  UserBy?: string | null;
  LogId?: string | null;
}

/**
 * AWS SQS publisher — config disalin dari WMS_CoreApp `SqsOptions`:
 * SQS_REGION, SQS_QUEUE_ID, SQS_IAM_ACCESS_KEY, SQS_IAM_SECRET_KEY,
 * SQS_QUEUE_INVENTORY_STOCK (queue name SqsQueueInventoryStockStockAvailability).
 * URL: https://sqs.{region}.amazonaws.com/{queueId}/{queueName}
 */
class AwsSqsThird {
  private static instance: AwsSqsThird;
  private client: SQSClient | null = null;

  public static getInstance(): AwsSqsThird {
    if (!AwsSqsThird.instance) {
      AwsSqsThird.instance = new AwsSqsThird();
    }
    return AwsSqsThird.instance;
  }

  private getClient(): SQSClient {
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

  private getInventoryQueueUrl(): string {
    return `https://sqs.${process.env.SQS_REGION}.amazonaws.com/${process.env.SQS_QUEUE_ID}/${process.env.SQS_QUEUE_INVENTORY_STOCK}`;
  }

  /**
   * Parity CoreApp `SqsService.PublishToInventoryAsync`. ActionType default
   * 'WHSIN2' (tambah qtySOH dari binning); 'WHSINX' = kembalikan SOH (delete
   * actual incoming, parity CoreApp DeleteActualIncoming). LogId = UUID lokal.
   * // ponytail: MessageDataLog CoreApp via HTTP ke StockAPI legacy tidak dipanggil
   * (log 2.0 dikelola consumer); tambahkan jika consumer butuh tabel log pengirim.
   */
  public async publishToInventory(
    stock: StockAvailabilityMessage,
    userBy: string,
    actionType: 'WHSIN2' | 'WHSINX' | 'WHSCLIN' = 'WHSIN2',
  ): Promise<void> {
    const payload: StockAvailabilityFinalMessage = {
      StockAvailabilityDtos: [stock],
      ActionType: actionType,
      UserBy: userBy,
      LogId: randomUUID(),
    };

    // Gagal publish MEMBATALKAN binning: throw → transaksi di caller
    // rollback (binningQty tidak berubah tanpa notifikasi SQS ke inventory).
    await this.getClient().send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(payload),
        QueueUrl: this.getInventoryQueueUrl(),
      }),
    );
  }
}

export const awsSqsThird = AwsSqsThird.getInstance();
