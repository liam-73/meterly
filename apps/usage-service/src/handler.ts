import { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  putItem,
  getItem,
  incrementCounter,
  parseEvent,
  ApiRequestConsumedPayload,
  ProcessedEvent,
  EVENT_TYPES,
  PLAN_LIMITS,
  Tenant,
} from '@meterly/shared';

const USAGE_TABLE = process.env.USAGE_TABLE!;
const PROCESSED_EVENTS_TABLE = process.env.PROCESSED_EVENTS_TABLE!;
const TENANTS_TABLE = process.env.TENANTS_TABLE!;

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    await processRecord(record);
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    const snsMessage = JSON.parse(record.body);
    const eventMessage = snsMessage.Message;
    const domainEvent = parseEvent<ApiRequestConsumedPayload>(eventMessage);

    if (domainEvent.eventType !== EVENT_TYPES.API_REQUEST_CONSUMED) {
      console.log(`Ignoring event type: ${domainEvent.eventType}`);
      return;
    }

    const alreadyProcessed = await isEventProcessed(domainEvent.eventId);
    if (alreadyProcessed) {
      console.log(`Event ${domainEvent.eventId} already processed`);
      return;
    }

    await incrementUsage(domainEvent.payload.tenantId);

    await markEventProcessed(domainEvent.eventId);

    console.log(`Successfully processed event ${domainEvent.eventId}`);
  } catch (error) {
    console.error('Error processing record:', error);
    throw error;
  }
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  const processed = await getItem<ProcessedEvent>(PROCESSED_EVENTS_TABLE, { eventId });
  return !!processed;
}

async function markEventProcessed(eventId: string): Promise<void> {
  const processedEvent: ProcessedEvent = {
    eventId,
    processedAt: new Date().toISOString(),
  };
  await putItem(PROCESSED_EVENTS_TABLE, processedEvent);
}

async function incrementUsage(tenantId: string): Promise<void> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const key = `${tenantId}#${period}`;

  const tenant = await getItem<Tenant>(TENANTS_TABLE, { tenantId });
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const limit = PLAN_LIMITS[tenant.plan];

  const newCount = await incrementCounter(USAGE_TABLE, { tenantId: key }, 'requestCount');

  if (newCount > limit) {
    console.warn(`Tenant ${tenantId} exceeded limit: ${newCount}/${limit}`);
  }
}
