# API Examples

## 1. Create a Tenant

```bash
POST /tenants
Content-Type: application/json

{
  "name": "Acme Corp",
  "webhookUrl": "https://acme.com/webhooks/meterly"
}
```

Response:
```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Acme Corp",
  "plan": "FREE",
  "webhookUrl": "https://acme.com/webhooks/meterly",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

## 2. Create an API Key

```bash
POST /api-keys
Content-Type: application/json

{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:
```json
{
  "keyId": "660e8400-e29b-41d4-a716-446655440001",
  "apiKey": "a3f8d9c2e1b4567890abcdef1234567890abcdef1234567890abcdef12345678",
  "message": "Store this key securely. It will not be shown again."
}
```

## 3. Consume a Resource

```bash
GET /v1/resource
x-api-key: a3f8d9c2e1b4567890abcdef1234567890abcdef1234567890abcdef12345678
```

Response:
```json
{
  "message": "Resource accessed successfully"
}
```

---

# Event Payloads

## ApiRequestConsumed Event

```json
{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "eventType": "ApiRequestConsumed",
  "version": "1.0",
  "occurredAt": "2024-01-15T10:30:00.000Z",
  "payload": {
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## InvoiceCreated Event

```json
{
  "eventId": "223e4567-e89b-12d3-a456-426614174001",
  "eventType": "InvoiceCreated",
  "version": "1.0",
  "occurredAt": "2024-02-01T00:00:00.000Z",
  "payload": {
    "invoiceId": "770e8400-e29b-41d4-a716-446655440002",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-31",
    "totalRequests": 850,
    "amount": 0
  }
}
```

## InvoiceReady Event

```json
{
  "eventId": "323e4567-e89b-12d3-a456-426614174002",
  "eventType": "InvoiceReady",
  "version": "1.0",
  "occurredAt": "2024-02-01T00:05:00.000Z",
  "payload": {
    "invoiceId": "770e8400-e29b-41d4-a716-446655440002",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "pdfUrl": "https://meterly-invoices.s3.amazonaws.com/invoices/770e8400-e29b-41d4-a716-446655440002.pdf"
  }
}
```

---

# Webhook Payload

When an invoice is ready, the webhook service sends this to the tenant's webhook URL:

```json
{
  "event": "invoice.ready",
  "invoiceId": "770e8400-e29b-41d4-a716-446655440002",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "pdfUrl": "https://meterly-invoices.s3.amazonaws.com/invoices/770e8400-e29b-41d4-a716-446655440002.pdf",
  "timestamp": "2024-02-01T00:05:30.000Z"
}
```

---

# Event Flow Diagram

```
1. Client Request
   └─> GET /v1/resource (with x-api-key header)

2. API Service
   └─> Validates API key
   └─> Publishes ApiRequestConsumed event to SNS
   └─> Returns 200 OK

3. SNS Topic (Events)
   └─> Delivers event to Usage Service SQS queue

4. Usage Service (SQS Consumer)
   └─> Checks idempotency (processedEvents table)
   └─> Increments usage counter in DynamoDB
   └─> Marks event as processed

5. Billing Service (Scheduled Monthly)
   └─> Scans all tenants
   └─> For each tenant:
       └─> Fetches usage for previous month
       └─> Creates invoice in DynamoDB
       └─> Publishes InvoiceCreated event to SNS

6. SNS Topic (Events)
   └─> Delivers InvoiceCreated to Invoice Service SQS queue

7. Invoice Service (SQS Consumer)
   └─> Checks idempotency
   └─> Generates PDF invoice using PDFKit
   └─> Uploads PDF to S3
   └─> Updates invoice record with PDF URL
   └─> Publishes InvoiceReady event to SNS
   └─> Marks event as processed

8. SNS Topic (Events)
   └─> Delivers InvoiceReady to Webhook Service SQS queue

9. Webhook Service (SQS Consumer)
   └─> Checks idempotency
   └─> Fetches tenant webhook URL
   └─> Sends POST request with invoice details
   └─> Retries on failure (max 3 attempts)
   └─> Marks event as processed
```

---

# Error Handling

## Failed Webhook Delivery

If webhook delivery fails after max retries, the message goes to DLQ:

```
SQS Queue (webhook-service-queue)
  └─> Max Receives: 3
  └─> Dead Letter Queue: webhook-service-dlq
```

Monitor the DLQ for failed webhook deliveries and alert operations team.

## Idempotency

All async consumers check the `processedEvents` table before processing:

```typescript
const alreadyProcessed = await isEventProcessed(eventId);
if (alreadyProcessed) {
  console.log(`Event ${eventId} already processed`);
  return;
}
```

This prevents duplicate processing if SQS delivers the same message multiple times.
