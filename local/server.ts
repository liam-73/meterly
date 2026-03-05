import express from 'express';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as path from 'path';
import * as moduleAlias from 'module-alias';

console.log('Starting Meterly local development server (LocalStack-backed)...\n');

// Build first if needed
const fs = require('fs');
const distPath = path.join(__dirname, '../dist/apps/api-service');
if (!fs.existsSync(distPath)) {
  console.error('⚠️  Build output not found. Please run: pnpm build');
  process.exit(1);
}

// Register module alias for @meterly/shared
moduleAlias.addAlias('@meterly/shared', path.join(__dirname, '../dist/apps/api-service/libs/shared/src'));

// Core environment configuration (tables, topics, buckets)
process.env.TENANTS_TABLE = process.env.TENANTS_TABLE || 'tenants';
process.env.API_KEYS_TABLE = process.env.API_KEYS_TABLE || 'apiKeys';
process.env.USAGE_TABLE = process.env.USAGE_TABLE || 'usage';
process.env.INVOICES_TABLE = process.env.INVOICES_TABLE || 'invoices';
process.env.PROCESSED_EVENTS_TABLE = process.env.PROCESSED_EVENTS_TABLE || 'processedEvents';
process.env.EVENTS_TOPIC_ARN = process.env.EVENTS_TOPIC_ARN || 'local-events-topic';
process.env.PDF_BUCKET = process.env.PDF_BUCKET || 'local-pdf-bucket';

// Point AWS SDKs at LocalStack by default
process.env.AWS_ENDPOINT = process.env.AWS_ENDPOINT || 'http://localhost:4566';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';

// Import the compiled API handler (uses shared AWS helpers configured via env)
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

const PORT = 3000;

async function start() {
  app.listen(PORT, () => {
    console.log(`\n🚀 Meterly running locally on http://localhost:${PORT}`);
    console.log(`\n📊 Open in browser: http://localhost:${PORT}`);
    console.log('\nAPI endpoints:');
    console.log('  POST   http://localhost:3000/tenants');
    console.log('  POST   http://localhost:3000/api-keys');
    console.log('  GET    http://localhost:3000/v1/resource');
    console.log('');
  });
}

start().catch(console.error);
