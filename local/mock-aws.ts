// Mock AWS SDK clients for local development

import * as storage from './mock-storage';
import * as events from './mock-events';

// Override DynamoDB client
export const mockDynamoDB = {
  async putItem(tableName: string, item: Record<string, any>) {
    storage.putItem(tableName, item);
  },

  async getItem<T>(tableName: string, key: Record<string, any>): Promise<T | undefined> {
    return storage.getItem(tableName, key) as T | undefined;
  },

  async updateItem(tableName: string, key: Record<string, any>, updates: Record<string, any>) {
    storage.updateItem(tableName, key, updates);
  },

  async incrementCounter(tableName: string, key: Record<string, any>, attribute: string, inc: number = 1): Promise<number> {
    return storage.incrementCounter(tableName, key, attribute, inc);
  },
};

// Override SNS client
export const mockSNS = {
  async publishEvent(topicArn: string, event: any) {
    await events.publish(event);
  },
};

// Override S3 client
export const mockS3 = {
  async uploadFile(bucket: string, key: string, body: Buffer, contentType: string): Promise<string> {
    const url = `http://localhost:3000/files/${key}`;
    console.log(`[S3] Mock upload: ${url}`);
    return url;
  },
};

export { storage, events };
