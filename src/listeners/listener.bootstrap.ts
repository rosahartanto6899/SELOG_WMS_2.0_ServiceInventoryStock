import { Container } from 'inversify';
import logger from '@/shared-libs/utils/logger.util';
import { BaseSqsListener } from './base-sqs-listener';
import { SQS_LISTENER_CONFIG } from './listener.config';

/**
 * Initialize + start SQS listeners — listener.bootstrap pattern from
 * ServiceBilling, SQS transport (parity with legacy consumer.js). Called by
 * server.ts once the DB connection is ready.
 */
export async function initializeSqsListeners(
  container: Container,
): Promise<void> {
  for (const registration of SQS_LISTENER_CONFIG) {
    const { listenerClass, config } = registration;

    if (!config.enabled) {
      logger.info(`Listener ${listenerClass.name} is disabled, skipping`);
      continue;
    }

    if (!container.isBound(listenerClass)) {
      container.bind(listenerClass).toSelf().inSingletonScope();
    }

    const listener = container.get<BaseSqsListener>(listenerClass);
    await listener.startListening();
    logger.info(`Listener ${listenerClass.name} started`);
  }
}

export async function stopSqsListeners(
  container: Container,
): Promise<void> {
  for (const registration of SQS_LISTENER_CONFIG) {
    if (!registration.config.enabled) continue;
    if (!container.isBound(registration.listenerClass)) continue;
    const listener = container.get<BaseSqsListener>(
      registration.listenerClass,
    );
    await listener.stopListening();
  }
}
