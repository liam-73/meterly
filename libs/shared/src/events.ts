import { v4 as uuidv4 } from 'uuid';

export interface BaseEvent {
  eventId: string;
  eventType: string;
  version: string;
  occurredAt: string;
  payload: unknown;
}

export interface ApiRequestConsumedPayload {
  tenantId: string;
  timestamp: string;
}

export interface InvoiceCreatedPayload {
  invoiceId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  totalRequests: number;
  amount: number;
}

export interface InvoiceReadyPayload {
  invoiceId: string;
  tenantId: string;
  pdfUrl: string;
}

export function createEvent<T>(eventType: string, payload: T): BaseEvent {
  return {
    eventId: uuidv4(),
    eventType,
    version: '1.0',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function parseEvent<T>(message: string): BaseEvent & { payload: T } {
  const event = JSON.parse(message);
  return event as BaseEvent & { payload: T };
}
