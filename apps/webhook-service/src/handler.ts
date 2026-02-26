import { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  getItem,
  parseEvent,
  putItem,
  EVENT_TYPES,
  WEBHOOK_MAX_RETRIES,
  InvoiceReadyPayload,
  Tenant,
  ProcessedEvent,
} from '@meterly/shared';

const TENANTS_TABLE = process.env.TENANTS_TABLE!;
const PROCESSED_EVENTS_TABLE = process.env.PROCESSED_EVENTS_TABLE!;

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    await processRecord(record);
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    const snsMessage = JSON.parse(record.body);
    const eventMessage = snsMessage.Message;
    const domainEvent = parseEvent<InvoiceReadyPayload>(eventMessage);

    if (domainEvent.eventType !== EVENT_TYPES.INVOICE_READY) {
      console.log(`Ignoring event type: ${domainEvent.eventType}`);
      return;
    }

    const alreadyProcessed = await isEventProcessed(domainEvent.eventId);
    if (alreadyProcessed) {
      console.log(`Event ${domainEvent.eventId} already processed`);
      return;
    }

    await sendWebhook(domainEvent.payload);

    await markEventProcessed(domainEvent.eventId);

    console.log(`Successfully processed event ${domainEvent.eventId}`);
  } catch (error) {
    console.error('Error processing record:', error);
    const retryCount = getRetryCount(record);
    if (retryCount >= WEBHOOK_MAX_RETRIES) {
      console.error(`Max retries exceeded for record, sending to DLQ`);
    }
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

async function sendWebhook(payload: InvoiceReadyPayload): Promise<void> {
  const tenant = await getItem<Tenant>(TENANTS_TABLE, { tenantId: payload.tenantId });
  if (!tenant) {
    throw new Error(`Tenant ${payload.tenantId} not found`);
  }

  if (!tenant.webhookUrl) {
    console.log(`Tenant ${payload.tenantId} has no webhook URL configured`);
    return;
  }

  const webhookPayload = {
    event: 'invoice.ready',
    invoiceId: payload.invoiceId,
    tenantId: payload.tenantId,
    pdfUrl: payload.pdfUrl,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(tenant.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(webhookPayload),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }

  console.log(`Webhook sent successfully to ${tenant.webhookUrl}`);
}

function getRetryCount(record: SQSRecord): number {
  return parseInt(record.attributes.ApproximateReceiveCount || '1', 10);
}
