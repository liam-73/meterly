# Local Development Guide

Run Meterly locally using LocalStack to emulate AWS services.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start LocalStack (AWS emulator)
docker compose -f docker-compose.localstack.yml up -d

# Start local development server (talks to LocalStack)
AWS_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test pnpm dev
```

The server runs on `http://localhost:3000` with a web UI for testing and inspection.

## Web UI Features

Open `http://localhost:3000` for an interactive dashboard providing:

- **Tenant Management** - Create tenants with webhook URLs
- **API Key Generation** - Generate keys for any tenant
- **API Testing** - Send test requests with API keys
- **Real-time Statistics** - Monitor tenant count, key usage, and request volume
- **Event Monitoring** - View published events (ApiRequestConsumed, InvoiceCreated, InvoiceReady)
- **Data Inspection** - Browse tenants, usage records, invoices, and processed events
- **Data Reset** - Clear all in-memory state

The dashboard auto-refreshes every 5 seconds for real-time feedback.

## API Testing

### Create a Tenant

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","webhookUrl":"https://acme.com/webhooks"}'
```

Response:
```json
{
  "tenantId": "xxx-xxx-xxx",
  "name": "Acme Corp",
  "plan": "FREE",
  "webhookUrl": "https://acme.com/webhooks",
  "createdAt": "2026-02-22T..."
}
```

### Create an API Key

```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"YOUR_TENANT_ID"}'
```

Response:
```json
{
  "keyId": "xxx",
  "apiKey": "abc123...",
  "message": "Store this key securely. It will not be shown again."
}
```

Note: Save the `apiKey` value - it cannot be retrieved again.

### Consume a Resource

```bash
curl -X GET http://localhost:3000/v1/resource \
  -H "x-api-key: YOUR_API_KEY"
```

Response:
```json
{
  "message": "Resource accessed successfully"
}
```

This request triggers the complete flow:
1. API key validation
2. `ApiRequestConsumed` event published to SNS (LocalStack)
3. Usage service processes event from SQS and increments monthly counter
4. Event marked as processed for idempotency in DynamoDB

> Debug endpoints for the in-memory implementation have been removed now that LocalStack is the primary local environment.

## Local Architecture

The development server provides:

1. **LocalStack-backed AWS Services** - DynamoDB tables, SNS topics, SQS queues, and S3 buckets run in LocalStack
2. **Event-Driven Processing** - Events published to SNS are delivered to subscribed SQS queues
3. **Real Handler Code** - Uses actual compiled Lambda handlers from `dist/apps/`
4. **Asynchronous Semantics** - You can still invoke the async services via your usual AWS-style flows and scripts

## Event Flow

```
Client Request → API Handler
                    ↓
              Publish to SNS (in-memory)
                    ↓
              Deliver to SQS Queue (in-memory)
                    ↓
              Invoke Consumer Handler (usage-service)
                    ↓
              Check idempotency → Increment counter
```

## Manual Billing Run

Trigger the monthly billing process manually:

```bash
pnpm dev:billing
```

This executes the full billing flow:
1. Scans all tenants from in-memory storage
2. Fetches usage for previous month
3. Creates invoice records
4. Publishes `InvoiceCreated` events
5. Invoice service generates PDFs (mock URLs)
6. Publishes `InvoiceReady` events
7. Webhook service sends HTTP notifications

## Local Implementation

```
local/
  server.ts          # Express server wrapping Lambda handlers
  mock-storage.ts    # In-memory DynamoDB implementation
  mock-events.ts     # In-memory SNS/SQS event bus
  mock-aws.ts        # AWS SDK client mocks
```

The local server:
- Wraps Lambda handlers as Express routes
- Intercepts AWS SDK calls and redirects to in-memory implementations
- Maintains separate stores for each DynamoDB table
- Implements synchronous event delivery for instant feedback

## Troubleshooting

### Build Output Not Found

Run `pnpm build` to compile TypeScript to JavaScript before starting the dev server.

### Port 3000 Already in Use

Either kill the process using port 3000 or modify the `PORT` constant in `local/server.ts`.

### Changes Not Reflecting

1. Stop the running `pnpm dev` process
2. Run `pnpm build` if you modified source code
3. Start `pnpm dev` again

## Local vs AWS Comparison

| Component | AWS | Local (LocalStack) |
|-----------|-----|--------------------|
| Storage | DynamoDB | LocalStack DynamoDB |
| Messaging | SNS → SQS | LocalStack SNS → SQS |
| File Storage | S3 | LocalStack S3 |
| Webhooks | HTTP POST | Real HTTP POST to external URLs |
| Persistence | Durable | Durable within LocalStack volumes |
| Event Delivery | Asynchronous with retries | Asynchronous via LocalStack |

## Next Steps

1. Start LocalStack and the local server.
2. Test the complete flow: create tenant → generate API key → consume resource → verify usage in LocalStack tables.
3. Manually trigger billing with `pnpm dev:billing` (with `AWS_ENDPOINT` etc. set) to test invoice generation.
4. Deploy to AWS when ready (without `AWS_ENDPOINT` so the SDK talks to real AWS).
