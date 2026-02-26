import * as mockAWS from './mock-aws';
import * as shared from '../libs/shared/src/index';

// Mock AWS environment
process.env.TENANTS_TABLE = 'tenants';
process.env.USAGE_TABLE = 'usage';
process.env.INVOICES_TABLE = 'invoices';
process.env.EVENTS_TOPIC_ARN = 'local-topic';

// Patch the shared library
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id === '@meterly/shared') {
    return {
      ...shared,
      putItem: mockAWS.mockDynamoDB.putItem,
      getItem: mockAWS.mockDynamoDB.getItem,
      updateItem: mockAWS.mockDynamoDB.updateItem,
      incrementCounter: mockAWS.mockDynamoDB.incrementCounter,
      publishEvent: mockAWS.mockSNS.publishEvent,
      uploadFile: mockAWS.mockS3.uploadFile,
    };
  }
  return originalRequire.apply(this, arguments);
};

async function runBilling() {
  console.log('🔄 Running billing service...\n');

  const { handler: billingHandler } = await import('../apps/billing-service/src/handler');

  await billingHandler({
    'detail-type': 'Scheduled Event',
    time: new Date().toISOString(),
  } as any);

  console.log('\n✅ Billing complete!');
  console.log('\nCheck results:');
  console.log('  Invoices:', mockAWS.storage.scanTable('invoices'));
}

runBilling().catch(console.error);
