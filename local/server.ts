import express from 'express';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as path from 'path';
import * as moduleAlias from 'module-alias';

console.log('Starting Meterly local development server...\n');

// Build first if needed
const fs = require('fs');
const distPath = path.join(__dirname, '../dist/apps/api-service');
if (!fs.existsSync(distPath)) {
  console.error('⚠️  Build output not found. Please run: pnpm build');
  process.exit(1);
}

// Register module alias for @meterly/shared
moduleAlias.addAlias('@meterly/shared', path.join(__dirname, '../dist/apps/api-service/libs/shared/src'));

// Import mock services
const mockStorage = require('./mock-storage.ts');
const mockEvents = require('./mock-events.ts');

// Mock AWS services
process.env.TENANTS_TABLE = 'tenants';
process.env.API_KEYS_TABLE = 'apiKeys';
process.env.USAGE_TABLE = 'usage';
process.env.INVOICES_TABLE = 'invoices';
process.env.PROCESSED_EVENTS_TABLE = 'processedEvents';
process.env.EVENTS_TOPIC_ARN = 'local-topic';
process.env.PDF_BUCKET = 'local-bucket';

// Patch AWS SDK to use mocks
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id.includes('@aws-sdk/lib-dynamodb')) {
    return {
      DynamoDBDocumentClient: {
        from: () => null,
      },
      PutCommand: class {},
      GetCommand: class {},
      UpdateCommand: class {},
      QueryCommand: class {},
    };
  }
  if (id.includes('@aws-sdk/client-dynamodb')) {
    return {
      DynamoDBClient: class {},
      ScanCommand: class {},
    };
  }
  if (id.includes('@aws-sdk/client-sns')) {
    return {
      SNSClient: class {},
      PublishCommand: class {},
    };
  }
  if (id.includes('@aws-sdk/client-s3')) {
    return {
      S3Client: class {},
      PutObjectCommand: class {},
    };
  }
  return originalRequire.apply(this, arguments);
};

// Override shared library functions globally
const sharedPath = path.join(__dirname, '../dist/apps/api-service/libs/shared/src');
const dynamodbModule = require(path.join(sharedPath, 'dynamodb.js'));
const snsModule = require(path.join(sharedPath, 'sns.js'));
const s3Module = require(path.join(sharedPath, 's3.js'));

dynamodbModule.putItem = mockStorage.putItem;
dynamodbModule.getItem = mockStorage.getItem;
dynamodbModule.updateItem = mockStorage.updateItem;
dynamodbModule.incrementCounter = mockStorage.incrementCounter;

snsModule.publishEvent = async (topicArn: string, event: any) => {
  await mockEvents.publish(event);
};

s3Module.uploadFile = async (bucket: string, key: string) => {
  return `http://localhost:3000/files/${key}`;
};

// Now import handlers (they'll use the mocked functions)
const apiHandler = require(path.join(__dirname, '../dist/apps/api-service/apps/api-service/src/handler.js')).handler;

const app = express();
app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname, 'public')));

// Helper to convert Express request to Lambda event
function toLambdaEvent(req: express.Request, path: string): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(req.body),
    headers: req.headers as any,
    httpMethod: req.method,
    path,
    queryStringParameters: req.query as any,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  };
}

// API routes
app.post('/tenants', async (req, res) => {
  const event = toLambdaEvent(req, '/tenants');
  const result = await apiHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api-keys', async (req, res) => {
  const event = toLambdaEvent(req, '/api-keys');
  const result = await apiHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.get('/v1/resource', async (req, res) => {
  const event = toLambdaEvent(req, '/v1/resource');
  const result = await apiHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

// Debug endpoints
app.get('/debug/tables', (req, res) => {
  const tables = mockStorage.getAllTables();
  const data: Record<string, any[]> = {};
  for (const [name, map] of Object.entries(tables)) {
    data[name] = Array.from((map as Map<string, any>).values());
  }
  res.json(data);
});

app.get('/debug/events', (req, res) => {
  res.json(mockEvents.getEventLog());
});

app.delete('/debug/reset', (req, res) => {
  mockStorage.resetAllTables();
  mockEvents.clearEventLog();
  res.json({ message: 'All data cleared' });
});

// Import event types
const constants = require(path.join(sharedPath, 'constants.js'));

// Setup event handlers
async function setupEventHandlers() {
  // Usage service handler
  const usageHandler = require(path.join(__dirname, '../dist/apps/usage-service/apps/usage-service/src/handler.js')).handler;
  mockEvents.subscribe(constants.EVENT_TYPES.API_REQUEST_CONSUMED, async (event: any) => {
    console.log('[UsageService] Processing event:', event.eventId);

    const sqsEvent = {
      Records: [{
        body: JSON.stringify({
          Message: JSON.stringify(event),
        }),
        attributes: { ApproximateReceiveCount: '1' },
      }],
    };

    await usageHandler(sqsEvent as any);
  });

  // Invoice service handler
  const invoiceHandler = require(path.join(__dirname, '../dist/apps/invoice-service/apps/invoice-service/src/handler.js')).handler;
  mockEvents.subscribe(constants.EVENT_TYPES.INVOICE_CREATED, async (event: any) => {
    console.log('[InvoiceService] Processing event:', event.eventId);

    const sqsEvent = {
      Records: [{
        body: JSON.stringify({
          Message: JSON.stringify(event),
        }),
        attributes: { ApproximateReceiveCount: '1' },
      }],
    };

    await invoiceHandler(sqsEvent as any);
  });

  // Webhook service handler
  const webhookHandler = require(path.join(__dirname, '../dist/apps/webhook-service/apps/webhook-service/src/handler.js')).handler;
  mockEvents.subscribe(constants.EVENT_TYPES.INVOICE_READY, async (event: any) => {
    console.log('[WebhookService] Processing event:', event.eventId);

    const sqsEvent = {
      Records: [{
        body: JSON.stringify({
          Message: JSON.stringify(event),
        }),
        attributes: { ApproximateReceiveCount: '1' },
      }],
    };

    await webhookHandler(sqsEvent as any);
  });
}

const PORT = 3000;

async function start() {
  await setupEventHandlers();

  app.listen(PORT, () => {
    console.log(`\n🚀 Meterly running locally on http://localhost:${PORT}`);
    console.log(`\n📊 Open in browser: http://localhost:${PORT}`);
    console.log('\nAPI endpoints:');
    console.log('  POST   http://localhost:3000/tenants');
    console.log('  POST   http://localhost:3000/api-keys');
    console.log('  GET    http://localhost:3000/v1/resource');
    console.log('\nDebug endpoints:');
    console.log('  GET    http://localhost:3000/debug/tables');
    console.log('  GET    http://localhost:3000/debug/events');
    console.log('  DELETE http://localhost:3000/debug/reset');
    console.log('');
  });
}

start().catch(console.error);
