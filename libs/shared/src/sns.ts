import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { BaseEvent } from './events';

const client = new SNSClient({
  endpoint: process.env.AWS_ENDPOINT,
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      }
    : undefined,
});

export async function publishEvent(topicArn: string, event: BaseEvent): Promise<void> {
  await client.send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(event),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: event.eventType,
        },
      },
    })
  );
}
