# Meterly

A multi-tenant SaaS backend for API usage metering, invoicing, and billing automation.

## Motivation

This project demonstrates a production-realistic implementation of a usage-based billing system, addressing common distributed systems challenges including:

- Event-driven architecture with async processing
- Idempotent event handling to prevent duplicate operations
- Atomic counters for concurrent usage tracking
- Secure API key management with one-way hashing
- Multi-tenant data isolation
- Asynchronous invoice generation and delivery

The architecture is designed for AWS Lambda deployment, showcasing serverless patterns for scalable SaaS applications.

## Architecture Overview

The system follows an event-driven microservices pattern with five independent Lambda functions communicating via SNS/SQS:

1. **API Service** - Exposes HTTP endpoints for tenant management, API key creation, and resource consumption
2. **Usage Service** - Consumes usage events and atomically increments per-tenant counters
3. **Billing Service** - Scheduled monthly job that aggregates usage and creates invoice records
4. **Invoice Service** - Generates PDF invoices asynchronously and uploads to S3
5. **Webhook Service** - Delivers invoice notifications to tenant webhook endpoints with retry logic

**Data Flow:**
```
Client Request → API Gateway → API Service → SNS Topic
                                               ↓
                                          SQS Queue → Usage Service → DynamoDB

Monthly Trigger → Billing Service → SNS Topic → Invoice Service → S3 → Webhook Service
```

All async consumers implement idempotency via a `processedEvents` table to ensure exactly-once processing semantics.

## Tech Stack

- **Monorepo:** Nx
- **Runtime:** Node.js + TypeScript (strict mode)
- **Compute:** AWS Lambda
- **Storage:** DynamoDB
- **Messaging:** SNS (pub/sub) + SQS (queuing)
- **Object Storage:** S3
- **API Gateway:** REST API

## Quick Start

### Local Development

The project includes a local development server with in-memory storage for rapid iteration without AWS dependencies:

```bash
# Install dependencies
pnpm install

# Build all services
pnpm build

# Run local development server
pnpm dev
```

Access the web interface at `http://localhost:3000` for tenant management, API key creation, and testing.

See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for detailed local development guide.

### Build Commands

```bash
# Build all services
pnpm build

# Build specific service
pnpm build:api
pnpm build:usage
pnpm build:billing
pnpm build:invoice
pnpm build:webhook

# Clean build artifacts
pnpm clean
```

## Services

| Service | Trigger | Purpose |
|---------|---------|---------|
| api-service | API Gateway | HTTP endpoints for tenant/key management and resource consumption |
| usage-service | SQS | Tracks API usage per tenant per month with atomic counters |
| billing-service | EventBridge Schedule | Monthly job to generate invoices from usage data |
| invoice-service | SQS | Generates PDF invoices and stores in S3 |
| webhook-service | SQS | Sends invoice notifications to tenant webhooks with retry logic |

## Project Structure

```
apps/
  api-service/          # HTTP API handlers
  usage-service/        # SQS consumer for usage tracking
  billing-service/      # Scheduled Lambda for monthly billing
  invoice-service/      # SQS consumer for PDF generation
  webhook-service/      # SQS consumer for webhook notifications

libs/
  shared/               # Shared types, utilities, and AWS client wrappers
    types.ts            # Core domain types
    events.ts           # Event schemas and factories
    constants.ts        # Shared constants and limits
    dynamodb.ts         # DynamoDB operations
    sns.ts              # SNS publishing
    s3.ts               # S3 file operations
    crypto.ts           # API key generation and hashing

dist/
  apps/                 # Compiled JavaScript (Lambda deployment artifacts)
```

## Key Patterns

### Idempotent Event Processing

All SQS consumers follow the same pattern to prevent duplicate processing:

```typescript
1. Check if eventId exists in processedEvents table
2. If exists, skip processing
3. Process the event
4. Mark eventId as processed
```

### Atomic Usage Tracking

Usage counters use DynamoDB's atomic increment operations to handle concurrent requests safely:

```typescript
const period = `${year}-${month.padStart(2, '0')}`;
const key = `${tenantId}#${period}`;
await incrementCounter(USAGE_TABLE, { tenantId: key }, 'requestCount');
```

### Secure API Key Management

API keys are generated with cryptographically secure randomness and stored as SHA-256 hashes. Raw keys are returned only once at creation.

## Deployment

Each service is packaged as an independent Lambda function. Build artifacts are output to:

```
dist/apps/{service-name}/apps/{service-name}/src/handler.js
```

Deploy using infrastructure-as-code tools (AWS SAM, CDK, or Terraform) to provision:

- Lambda functions with appropriate IAM roles
- DynamoDB tables (tenants, apiKeys, usage, invoices, processedEvents)
- SNS topics and SQS queues with DLQ configuration
- S3 bucket for PDF storage
- API Gateway REST API
- EventBridge schedule for billing service

Environment variables for each Lambda function are documented in `.env.example`. Reference [CLAUDE.md](./CLAUDE.md) for detailed per-service configuration requirements.

## Production Considerations

This implementation demonstrates core patterns but would benefit from the following enhancements in a production environment:

**Observability:**
- Structured logging with correlation IDs across service boundaries
- Distributed tracing (X-Ray or similar)
- CloudWatch metrics for business KPIs (usage trends, invoice generation lag)
- Alerting on error rates, DLQ depth, and processing delays

**Reliability:**
- Exponential backoff for webhook retries with configurable timeouts
- Circuit breaker pattern for external HTTP calls
- More sophisticated DLQ monitoring and replay mechanisms

**Scalability:**
- Per-second rate limiting with token bucket algorithm
- Caching layer (ElastiCache) for tenant/API key lookups
- Consider Aurora Serverless or PostgreSQL if billing logic becomes complex (multi-tier pricing, prorations, credits)

**Security:**
- API authentication beyond API keys (OAuth 2.0, JWT)
- Encryption at rest for sensitive data
- Secrets rotation for API keys
- WAF rules for API Gateway

**Infrastructure:**
- Infrastructure as code (CDK/Terraform) with CI/CD pipeline
- Multi-environment deployment (dev/staging/prod)
- Automated integration tests
- Cost monitoring and optimization

## Documentation

- [EXAMPLES.md](./EXAMPLES.md) - API examples and event payload schemas

## License

MIT
