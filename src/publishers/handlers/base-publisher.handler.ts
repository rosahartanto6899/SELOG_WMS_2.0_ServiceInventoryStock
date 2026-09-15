import { injectable, inject } from 'inversify';
import { ServiceBusUtil } from '@/shared-libs/utils/service-bus';
import logger from '@/shared-libs/utils/logger.util';

/**
 * Abstract base class for Service Bus publishers
 * Provides common functionality for publishing messages to Service Bus topics
 * Can be extended by concrete publisher handlers and injected into services
 */
@injectable()
export abstract class BasePublisherHandler {
  @inject(ServiceBusUtil)
  protected serviceBus: ServiceBusUtil;

  /**
   * The topic name this publisher sends messages to
   * Must be implemented by concrete classes
   */
  abstract readonly topicName: string;

  /**
   * Publish a message to the configured Service Bus topic
   * @param body - The message body to publish
   * @param scheduleEnqueueTime - Optional. The UTC date and time when the message should be enqueued
   * @returns The sequence number if scheduled, void otherwise
   */
  async publish(body: any, scheduleEnqueueTime?: Date): Promise<void | string> {
    try {
      const messageBody = this.prepareMessage(body);

      logger.info(
        `Publishing message to topic: ${this.topicName}${
          scheduleEnqueueTime
            ? ` (scheduled for ${scheduleEnqueueTime.toISOString()})`
            : ''
        }`,
      );

      const result = await this.serviceBus.publish(
        this.topicName,
        messageBody,
        scheduleEnqueueTime,
      );

      logger.info(
        `Message published successfully to topic: ${this.topicName}${
          result ? ` with sequence number: ${result}` : ''
        }`,
      );

      return result;
    } catch (error) {
      logger.error(
        `Failed to publish message to topic ${this.topicName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Prepare the message before publishing
   * Override this method to add custom message preparation logic
   * @param body - The raw message body
   * @returns The prepared message body
   */
  protected prepareMessage(body: any): any {
    return {
      ...body,
      publishedAt: new Date().toISOString(),
      publisher: this.constructor.name,
    };
  }

  /**
   * Initialize the topic if needed
   * This will create the topic if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing publisher for topic: ${this.topicName}`);

      await this.serviceBus.initializeTopicsAndSubscriptions([
        {
          topicName: this.topicName,
          subscriptions: [], // Publishers don't need subscriptions
        },
      ]);

      logger.info(
        `Publisher initialized successfully for topic: ${this.topicName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to initialize publisher for topic ${this.topicName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Publish a batch of messages to the configured Service Bus topic
   * @param bodies - Array of message bodies to publish
   * @param scheduleEnqueueTime - Optional. The UTC date and time when messages should be enqueued
   */
  async publishBatch(bodies: any[], scheduleEnqueueTime?: Date): Promise<void> {
    try {
      logger.info(
        `Publishing batch of ${bodies.length} messages to topic: ${this.topicName}`,
      );

      const publishPromises = bodies.map((body) =>
        this.publish(body, scheduleEnqueueTime),
      );

      await Promise.all(publishPromises);

      logger.info(
        `Batch of ${bodies.length} messages published successfully to topic: ${this.topicName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to publish batch to topic ${this.topicName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Cancel a scheduled message in the configured Service Bus topic
   * @param sequenceNumber - The sequence number of the scheduled message to cancel
   */
  async cancelScheduledMessage(sequenceNumber: string): Promise<void> {
    try {
      logger.info(
        `Cancelling scheduled message ${sequenceNumber} from topic: ${this.topicName}`,
      );

      await this.serviceBus.cancelScheduledMessage(
        this.topicName,
        sequenceNumber,
      );

      logger.info(
        `Scheduled message ${sequenceNumber} cancelled successfully from topic: ${this.topicName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to cancel scheduled message ${sequenceNumber} from topic ${this.topicName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
