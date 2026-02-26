export const PLAN_LIMITS = {
  FREE: 1000,
} as const;

export const EVENT_TYPES = {
  API_REQUEST_CONSUMED: 'ApiRequestConsumed',
  INVOICE_CREATED: 'InvoiceCreated',
  INVOICE_READY: 'InvoiceReady',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
} as const;

export const WEBHOOK_MAX_RETRIES = 3;
