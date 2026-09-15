import { IPubSub } from '@/shared-libs/interfaces/pubsub.interface';
import { default as SecretManager } from '@/shared-libs/utils/secret-manager.util';
import logger from '@/shared-libs/utils/logger.util';

import {
  ServiceBusClient,
  delay,
  ProcessErrorArgs,
  isServiceBusError,
  ServiceBusReceivedMessage,
  ServiceBusMessage,
  ServiceBusAdministrationClient,
  CreateTopicOptions,
  CreateSubscriptionOptions,
  SqlRuleFilter,
} from '@azure/service-bus';
import moment from 'moment';

export class ServiceBusThird implements IPubSub {
  private static sbClient: ServiceBusClient;

  private static getClient(): ServiceBusClient {
    // https://github.com/Azure/azure-sdk-for-js/tree/%40azure/service-bus_7.7.1/sdk/servicebus
    const connectionString = SecretManager.env.SB_CONNECTION_STRING;
    if (!ServiceBusThird.sbClient) {
      ServiceBusThird.sbClient = new ServiceBusClient(connectionString, {
        retryOptions: {
          maxRetries: 5,
          retryDelayInMs: 30000,
        },
      });
    }

    return ServiceBusThird.sbClient;
  }

  async publish(topicName: string, body: any) {
    const sbClient = ServiceBusThird.getClient();
    const sender = sbClient.createSender(topicName);

    const adjustBody = {
      ...body,
      publishedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
    };

    const message: ServiceBusMessage = {
      body: adjustBody,
      contentType: 'application/json',
      applicationProperties: {
        topic_name: topicName,
      },
    };
    sender.sendMessages(message);
  }

  /**
   * Subscribes to a service bus topic and processes incoming messages.
   *
   * @param topicName - The name of the topic to subscribe to.
   * @param subscriptionName - The name of the subscription within the topic.
   * @param processMessageCallback - A callback function to handle processing of each message received.
   *
   * The method establishes a connection to the service bus and listens for messages.
   * It uses a receiver to handle messages in 'peekLock' mode.
   * Successfully processed messages are completed, while failed messages are sent to the dead letter queue.
   * Errors during message processing are logged, and specific handling is provided for various service bus errors.
   */
  async subscribe(
    topicName: string,
    subscriptionName: string,
    processMessageCallback: (
      message: ServiceBusReceivedMessage
    ) => Promise<void>
  ): Promise<void> {
    const sbClient = ServiceBusThird.getClient();
    const receiver = sbClient.createReceiver(topicName, subscriptionName, {
      receiveMode: 'peekLock',
    });

    try {
      receiver.subscribe({
        processMessage: async (message: ServiceBusReceivedMessage) => {
          try {
            // Logika khusus di sini
            const loggerData = {
              topicName,
              subscriptionName,
              payload: message.body,
            };
            logger.info(
              `subscriber recieved message: \n${JSON.stringify(
                loggerData,
                null,
                2
              )}`
            );
            await processMessageCallback(message);

            // Setelah logika berhasil, complete message
            await receiver.completeMessage(message);
          } catch (error: any) {
            const errorDescription =
              typeof error === 'object' && error !== null
                ? JSON.stringify(error, Object.getOwnPropertyNames(error))
                : String(error);

            await receiver.deadLetterMessage(message, {
              deadLetterReason: error.message || 'ProcessingError',
              deadLetterErrorDescription: errorDescription,
            });
            await receiver.deadLetterMessage(message);
          }
        },
        processError: async (args: ProcessErrorArgs) => {
          console.error(`Error from source ${args.errorSource}:`, args.error);

          if (isServiceBusError(args.error)) {
            switch (args.error.code) {
              case 'MessagingEntityDisabled':
              case 'MessagingEntityNotFound':
              case 'UnauthorizedAccess':
                console.error(
                  `Unrecoverable error occurred: ${args.error.code}`
                );
                break;
              case 'MessageLockLost':
                console.warn('Message lock lost:', args.error);
                break;
              case 'ServiceBusy':
                await delay(1000);
                break;
            }
          }
        },
      });
    } catch (err) {
      console.error('Error occurred while receiving messages:', err);
    }
  }

  /**
   * Receive messages from a service bus topic subscription's dead letter queue
   * and either complete them if they have expired or send them back to the
   * original topic if they have not expired.
   *
   * @param topicName - The name of the topic to receive messages from.
   * @param subscriptionName - The name of the subscription to receive messages from.
   */
  async dlq(topicName: string, subscriptionName: string): Promise<void> {
    const sbClient = ServiceBusThird.getClient();
    const receiver = sbClient.createReceiver(topicName, subscriptionName, {
      receiveMode: 'peekLock',
      subQueueType: 'deadLetter',
    });
    const sender = sbClient.createSender(topicName);

    while (true) {
      try {
        const messages = await receiver.receiveMessages(10, {
          maxWaitTimeInMs: 5000,
        });
        for (const message of messages) {
          const publishedAt = message.body?.publishedAt
            ? moment(message.body?.publishedAt)
            : null;
          if (publishedAt?.add(20, 'minutes').isBefore(moment())) {
            console.log(`Message expired ${topicName} ${subscriptionName}`);
            await receiver.completeMessage(message);
          } else {
            await sender.sendMessages({
              body: message.body,
              applicationProperties: { subscription_name: subscriptionName },
            });
            console.log(`DLQ completed ${topicName} ${subscriptionName}`);
            await receiver.completeMessage(message);
          }
        }
      } catch (error) {
        console.log('Error processing DLQ messages:', error);
      }

      await delay(20000);
    }
  }

  /**
   * Initializes topics and subscriptions based on an array of topics and subscriptions.
   * @param topicSubscriptions Array of objects containing topic and subscription details.
   */
  async initializeTopicsAndSubscriptions(
    topicSubscriptions: { topicName: string; subscriptions: string[] }[]
  ): Promise<void> {
    const connectionString = SecretManager.env.SB_CONNECTION_STRING;
    const adminClient = new ServiceBusAdministrationClient(connectionString);

    for (const { topicName, subscriptions } of topicSubscriptions) {
      // Ensure the topic exists
      const topicExists = await adminClient
        .getTopic(topicName)
        .catch(() => null);
      if (!topicExists) {
        console.log(`Creating topic: ${topicName}`);
        const topicOptions: CreateTopicOptions = {
          maxSizeInMegabytes: 1024,
          defaultMessageTimeToLive: 'P14D',
        };
        await adminClient.createTopic(topicName, topicOptions);
      } else {
        console.log(`Topic "${topicName}" already exists.`);
      }

      // Ensure the subscriptions exist
      for (const subscriptionName of subscriptions) {
        const subscriptionExists = await adminClient
          .getSubscription(topicName, subscriptionName)
          .catch(() => null);
        if (!subscriptionExists) {
          console.log(
            `Creating subscription: ${subscriptionName} for topic: ${topicName}`
          );

          const subscriptionOptions: CreateSubscriptionOptions = {
            maxDeliveryCount: 1,
            autoDeleteOnIdle: 'P10675199DT2H48M5.4775807S', // Never auto-delete (effectively infinite)
            defaultMessageTimeToLive: 'P14D', // 14 days
            lockDuration: 'PT1M', // 1 minute
          };

          await adminClient.createSubscription(
            topicName,
            subscriptionName,
            subscriptionOptions
          );

          const filterExpressionTopic = `topic_name = '${topicName}'`;
          const ruleNameTopic = 'topic_name'; // Rule name for topic filter
          const ruleFilterTopic: SqlRuleFilter = {
            sqlExpression: filterExpressionTopic,
          };
          const filterExpressionSubscription = `subscription_name = '${subscriptionName}'`;
          const ruleNameSubscription = 'subscription_name';
          const ruleFilterSubscription: SqlRuleFilter = {
            sqlExpression: filterExpressionSubscription,
          };
          // delete default rule
          await adminClient.deleteRule(topicName, subscriptionName, '$Default');
          // create rule topic_name
          await adminClient.createRule(
            topicName,
            subscriptionName,
            ruleNameTopic,
            ruleFilterTopic
          );
          console.log(
            `Added filter rule for topic to subscription "${subscriptionName}"`
          );

          // create rule subscription_name
          await adminClient.createRule(
            topicName,
            subscriptionName,
            ruleNameSubscription,
            ruleFilterSubscription
          );
          console.log(
            `Added filter rule for subscription to subscription "${subscriptionName}"`
          );
          console.log(
            `Added filter rule to subscription "${subscriptionName}"`
          );
        } else {
          console.log(
            `Subscription "${subscriptionName}" for topic "${topicName}" already exists.`
          );
        }
      }
    }
  }
}
