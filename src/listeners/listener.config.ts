import { StockAvailabilityListener } from './handlers/stock-availability.listener';

/** Interface untuk registrasi listener SQS — pola IPublisherRegistration /
 *  IListenerRegistration (ServiceBilling). */
export interface ISqsListenerRegistration {
  listenerClass: any;
  config: {
    /** Nama queue SQS (override env bila perlu). */
    queueName?: string;
    enabled: boolean;
    autoStart?: boolean;
  };
}

/**
 * Konfigurasi listener SQS ServiceInventoryStock.
 * Queue name default dari listener (env SQS_QUEUE_INVENTORY_STOCK).
 */
export const SQS_LISTENER_CONFIG: ISqsListenerRegistration[] = [
  {
    listenerClass: StockAvailabilityListener,
    config: {
      // listener membaca env yang sama dengan publisher (aws-sqs.third.ts);
      // nilai di sini hanya dokumentasi default.
      queueName:
        process.env.SQS_QUEUE_INVENTORY_STOCK ||
        'wms-20-sqs-inventorystock-stockavailability-development',
      enabled: process.env.SQS_LISTENER_ENABLED === 'true',
      autoStart: true,
    },
  },
  // Tambahkan listener lain di sini.
];
