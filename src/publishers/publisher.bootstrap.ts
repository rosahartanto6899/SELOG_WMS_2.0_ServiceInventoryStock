import { Container } from 'inversify';
import logger from '@/shared-libs/utils/logger.util';
import { SERVICE_BUS_PUBLISHER_CONFIG } from './publisher.config';
import { BasePublisherHandler } from './handlers';

/**
 * Initialize all configured publishers
 * This will create topic infrastructure if autoInitialize is enabled
 * @param container - The Inversify container to register publishers
 */
export async function initializePublishers(
  container: Container
): Promise<void> {
  try {
    logger.info('Initializing Service Bus publishers...');

    for (const registration of SERVICE_BUS_PUBLISHER_CONFIG) {
      const { publisherClass, config } = registration;

      if (!config.enabled) {
        logger.info(
          `Publisher ${publisherClass.name} is disabled, skipping initialization`
        );
        continue;
      }

      // Bind the publisher class to the container if not already bound
      if (!container.isBound(publisherClass)) {
        container.bind(publisherClass).toSelf().inSingletonScope();
        logger.info(`Registered publisher: ${publisherClass.name}`);
      }

      // Auto-initialize if configured
      if (config.autoInitialize) {
        const publisher = container.get<BasePublisherHandler>(publisherClass);
        await publisher.initialize();
        logger.info(
          `Publisher ${publisherClass.name} initialized successfully`
        );
      }
    }

    logger.info('All Service Bus publishers initialized successfully');
  } catch (error) {
    logger.error(
      `Failed to initialize Service Bus publishers: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

/**
 * Register publishers with the Inversify container without initializing them
 * Use this if you want to register publishers but defer initialization
 * @param container - The Inversify container to register publishers
 */
export function registerPublishers(container: Container): void {
  try {
    logger.info('Registering Service Bus publishers...');

    for (const registration of SERVICE_BUS_PUBLISHER_CONFIG) {
      const { publisherClass, config } = registration;

      if (!config.enabled) {
        logger.info(
          `Publisher ${publisherClass.name} is disabled, skipping registration`
        );
        continue;
      }

      // Bind the publisher class to the container if not already bound
      if (!container.isBound(publisherClass)) {
        container.bind(publisherClass).toSelf().inSingletonScope();
        logger.info(`Registered publisher: ${publisherClass.name}`);
      }
    }

    logger.info('All Service Bus publishers registered successfully');
  } catch (error) {
    logger.error(
      `Failed to register Service Bus publishers: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
