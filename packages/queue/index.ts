import { connect, type Channel, type ConsumeMessage } from 'amqplib';
import { getConfig } from '../config/index.ts';
import { logger } from '../logger/index.ts';

export type PipelineRoutingKey =
  | 'crawl.start'
  | 'fetch.request'
  | 'parse.request'
  | 'dedup.request'
  | 'summarize.request'
  | 'publication.draft.request'
  | 'publication.approved'
  | 'publication.schedule';

type AmqpConnection = Awaited<ReturnType<typeof connect>>;

export interface QueueContext {
  connection: AmqpConnection;
  channel: Channel;
}

const EXCHANGE = 'pipeline';

export async function createQueueContext(): Promise<QueueContext> {
  const config = getConfig();
  const connection = await connect(config.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.prefetch(1);
  return { connection, channel };
}

export async function publishMessage(
  context: QueueContext,
  routingKey: PipelineRoutingKey,
  message: Record<string, unknown>
): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ ...message, timestamp: new Date().toISOString() }));
  context.channel.publish(EXCHANGE, routingKey, payload, { persistent: true });
  logger.debug({ routingKey, message }, 'Published message');
}

export async function createConsumer(
  queueName: string,
  routingKey: PipelineRoutingKey,
  handler: (msg: Record<string, unknown>) => Promise<void>
): Promise<() => Promise<void>> {
  const context = await createQueueContext();
  await context.channel.assertQueue(queueName, { durable: true });
  await context.channel.bindQueue(queueName, EXCHANGE, routingKey);

  const consumerTag = await context.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
    if (!msg) {
      return;
    }

    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content);
      context.channel.ack(msg);
    } catch (error) {
      logger.error({ error }, 'Queue handler failed');
      context.channel.nack(msg, false, true);
    }
  });

  logger.info({ queueName, routingKey }, 'Queue consumer started');

  return async () => {
    await context.channel.cancel(consumerTag.consumerTag);
    await context.connection.close();
  };
}
