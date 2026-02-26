import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  putItem,
  getItem,
  generateApiKey,
  hashApiKey,
  publishEvent,
  createEvent,
  EVENT_TYPES,
  Tenant,
  ApiKey,
  ApiRequestConsumedPayload,
} from '@meterly/shared';

const TENANTS_TABLE = process.env.TENANTS_TABLE!;
const API_KEYS_TABLE = process.env.API_KEYS_TABLE!;
const EVENTS_TOPIC_ARN = process.env.EVENTS_TOPIC_ARN!;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path;
    const method = event.httpMethod;

    if (method === 'POST' && path === '/tenants') {
      return await createTenant(event);
    }

    if (method === 'POST' && path === '/api-keys') {
      return await createApiKey(event);
    }

    if (method === 'GET' && path === '/v1/resource') {
      return await consumeResource(event);
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

async function createTenant(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const { name, webhookUrl } = body;

  if (!name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Name is required' }),
    };
  }

  const tenant: Tenant = {
    tenantId: uuidv4(),
    name,
    plan: 'FREE',
    webhookUrl,
    createdAt: new Date().toISOString(),
  };

  await putItem(TENANTS_TABLE, tenant);

  return {
    statusCode: 201,
    body: JSON.stringify(tenant),
  };
}

async function createApiKey(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const { tenantId } = body;

  if (!tenantId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'TenantId is required' }),
    };
  }

  const tenant = await getItem<Tenant>(TENANTS_TABLE, { tenantId });
  if (!tenant) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Tenant not found' }),
    };
  }

  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);

  const apiKey: ApiKey = {
    keyId: uuidv4(),
    tenantId,
    hashedKey,
    createdAt: new Date().toISOString(),
  };

  await putItem(API_KEYS_TABLE, apiKey);

  return {
    statusCode: 201,
    body: JSON.stringify({
      keyId: apiKey.keyId,
      apiKey: rawKey,
      message: 'Store this key securely. It will not be shown again.',
    }),
  };
}

async function consumeResource(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const apiKeyHeader = event.headers['x-api-key'];

  if (!apiKeyHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'API key required' }),
    };
  }

  const hashedKey = hashApiKey(apiKeyHeader);

  const apiKey = await getItem<ApiKey>(API_KEYS_TABLE, { hashedKey });
  if (!apiKey) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid API key' }),
    };
  }

  const payload: ApiRequestConsumedPayload = {
    tenantId: apiKey.tenantId,
    timestamp: new Date().toISOString(),
  };

  const domainEvent = createEvent(EVENT_TYPES.API_REQUEST_CONSUMED, payload);
  await publishEvent(EVENTS_TOPIC_ARN, domainEvent);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Resource accessed successfully' }),
  };
}
