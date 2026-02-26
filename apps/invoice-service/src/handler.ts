import { SQSEvent, SQSRecord } from 'aws-lambda';
import PDFDocument from 'pdfkit';
import {
  getItem,
  updateItem,
  uploadFile,
  publishEvent,
  createEvent,
  parseEvent,
  EVENT_TYPES,
  INVOICE_STATUS,
  InvoiceCreatedPayload,
  InvoiceReadyPayload,
  Invoice,
  Tenant,
  ProcessedEvent,
  putItem,
} from '@meterly/shared';

const INVOICES_TABLE = process.env.INVOICES_TABLE!;
const TENANTS_TABLE = process.env.TENANTS_TABLE!;
const PROCESSED_EVENTS_TABLE = process.env.PROCESSED_EVENTS_TABLE!;
const PDF_BUCKET = process.env.PDF_BUCKET!;
const EVENTS_TOPIC_ARN = process.env.EVENTS_TOPIC_ARN!;

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    await processRecord(record);
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    const snsMessage = JSON.parse(record.body);
    const eventMessage = snsMessage.Message;
    const domainEvent = parseEvent<InvoiceCreatedPayload>(eventMessage);

    if (domainEvent.eventType !== EVENT_TYPES.INVOICE_CREATED) {
      console.log(`Ignoring event type: ${domainEvent.eventType}`);
      return;
    }

    const alreadyProcessed = await isEventProcessed(domainEvent.eventId);
    if (alreadyProcessed) {
      console.log(`Event ${domainEvent.eventId} already processed`);
      return;
    }

    await generateInvoicePdf(domainEvent.payload);

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

async function generateInvoicePdf(payload: InvoiceCreatedPayload): Promise<void> {
  const invoice = await getItem<Invoice>(INVOICES_TABLE, { invoiceId: payload.invoiceId });
  if (!invoice) {
    throw new Error(`Invoice ${payload.invoiceId} not found`);
  }

  const tenant = await getItem<Tenant>(TENANTS_TABLE, { tenantId: payload.tenantId });
  if (!tenant) {
    throw new Error(`Tenant ${payload.tenantId} not found`);
  }

  const pdfBuffer = await createPdfBuffer(invoice, tenant);

  const pdfKey = `invoices/${invoice.invoiceId}.pdf`;
  const pdfUrl = await uploadFile(PDF_BUCKET, pdfKey, pdfBuffer, 'application/pdf');

  await updateItem(INVOICES_TABLE, { invoiceId: invoice.invoiceId }, {
    pdfUrl,
    status: INVOICE_STATUS.FINALIZED,
  });

  const readyPayload: InvoiceReadyPayload = {
    invoiceId: invoice.invoiceId,
    tenantId: invoice.tenantId,
    pdfUrl,
  };

  const domainEvent = createEvent(EVENT_TYPES.INVOICE_READY, readyPayload);
  await publishEvent(EVENTS_TOPIC_ARN, domainEvent);

  console.log(`Generated PDF for invoice ${invoice.invoiceId}`);
}

async function createPdfBuffer(invoice: Invoice, tenant: Tenant): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Invoice ID: ${invoice.invoiceId}`);
    doc.text(`Tenant: ${tenant.name}`);
    doc.text(`Period: ${invoice.periodStart} to ${invoice.periodEnd}`);
    doc.moveDown();

    doc.text(`Total API Requests: ${invoice.totalRequests}`);
    doc.text(`Amount: $${invoice.amount.toFixed(2)}`);
    doc.moveDown();

    doc.fontSize(10).text(`Generated on: ${new Date().toISOString()}`, { align: 'right' });

    doc.end();
  });
}
