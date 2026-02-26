import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { BaseEvent } from './events';

const client = new SNSClient({});

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
