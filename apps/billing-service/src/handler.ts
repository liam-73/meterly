import { ScheduledEvent } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  putItem,
  getItem,
  publishEvent,
  createEvent,
  EVENT_TYPES,
  INVOICE_STATUS,
  Tenant,
  Usage,
  Invoice,
  InvoiceCreatedPayload,
} from '@meterly/shared';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TENANTS_TABLE = process.env.TENANTS_TABLE!;
const USAGE_TABLE = process.env.USAGE_TABLE!;
const INVOICES_TABLE = process.env.INVOICES_TABLE!;
const EVENTS_TOPIC_ARN = process.env.EVENTS_TOPIC_ARN!;

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('Starting billing run...');

  const previousMonth = getPreviousMonth();
  const tenants = await getAllTenants();

  for (const tenant of tenants) {
    await processTenantBilling(tenant, previousMonth);
  }

  console.log(`Billing run complete. Processed ${tenants.length} tenants.`);
}

async function getAllTenants(): Promise<Tenant[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TENANTS_TABLE,
    })
  );

  return (result.Items || []).map((item) => ({
    tenantId: item.tenantId.S!,
    name: item.name.S!,
    plan: item.plan.S! as 'FREE',
    webhookUrl: item.webhookUrl?.S,
    createdAt: item.createdAt.S!,
  }));
}

async function processTenantBilling(tenant: Tenant, period: string): Promise<void> {
  const usageKey = `${tenant.tenantId}#${period}`;
  const usage = await getItem<Usage>(USAGE_TABLE, { tenantId: usageKey });

  const totalRequests = usage?.requestCount || 0;
  const amount = calculateAmount(totalRequests, tenant.plan);

  const invoice: Invoice = {
    invoiceId: uuidv4(),
    tenantId: tenant.tenantId,
    periodStart: `${period}-01`,
    periodEnd: getLastDayOfMonth(period),
    totalRequests,
    amount,
    status: INVOICE_STATUS.DRAFT,
    createdAt: new Date().toISOString(),
  };

  await putItem(INVOICES_TABLE, invoice);

  const payload: InvoiceCreatedPayload = {
    invoiceId: invoice.invoiceId,
    tenantId: invoice.tenantId,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    totalRequests: invoice.totalRequests,
    amount: invoice.amount,
  };

  const domainEvent = createEvent(EVENT_TYPES.INVOICE_CREATED, payload);
  await publishEvent(EVENTS_TOPIC_ARN, domainEvent);

  console.log(`Created invoice ${invoice.invoiceId} for tenant ${tenant.tenantId}`);
}

function calculateAmount(requests: number, plan: string): number {
  if (plan === 'FREE') {
    return 0;
  }
  return 0;
}

function getPreviousMonth(): string {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
}

function getLastDayOfMonth(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${period}-${String(lastDay).padStart(2, '0')}`;
}
