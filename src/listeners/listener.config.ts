import { StockAvailabilityListener } from './handlers/stock-availability.listener';

/** Interface for SQS listener registration — IPublisherRegistration /
 *  IListenerRegistration pattern (ServiceBilling). */
export interface ISqsListenerRegistration {
  listenerClass: any;
  config: {
    /** SQS queue name (overrides env if needed). */
    queueName?: string;
    enabled: boolean;
    autoStart?: boolean;
  };
}

/**
 * SQS listener configuration for ServiceInventoryStock.
 * Default queue name comes from the listener (env SQS_QUEUE_INVENTORY_STOCK).
 */
export const SQS_LISTENER_CONFIG: ISqsListenerRegistration[] = [
  {
    listenerClass: StockAvailabilityListener,
    config: {
      // the listener reads the same env as the publisher (aws-sqs.third.ts);
      // the value here is just documentation of the default.
      queueName:
        process.env.SQS_QUEUE_INVENTORY_STOCK ||
        'wms-20-sqs-inventorystock-stockavailability-development',
      enabled: process.env.SQS_LISTENER_ENABLED === 'true',
      autoStart: true,
    },
  },
  // Add other listeners here.
];
