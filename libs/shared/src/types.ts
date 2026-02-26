export type Plan = 'FREE';

export interface Tenant {
  tenantId: string;
  name: string;
  plan: Plan;
  webhookUrl?: string;
  createdAt: string;
}

export interface ApiKey {
  keyId: string;
  tenantId: string;
  hashedKey: string;
  createdAt: string;
}

export interface Usage {
  tenantId: string;
  period: string;
  requestCount: number;
}

export interface Invoice {
  invoiceId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  totalRequests: number;
  amount: number;
  status: string;
  pdfUrl?: string;
  createdAt: string;
}

export interface ProcessedEvent {
  eventId: string;
  processedAt: string;
}
