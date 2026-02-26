import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export async function putItem(tableName: string, item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    })
  );
}

export async function getItem<T>(
  tableName: string,
  key: Record<string, any>
): Promise<T | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
    })
  );
  return result.Item as T | undefined;
}

export async function incrementCounter(
  tableName: string,
  key: Record<string, any>,
  attribute: string,
  increment: number = 1
): Promise<number> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `ADD ${attribute} :inc`,
      ExpressionAttributeValues: {
        ':inc': increment,
      },
      ReturnValues: 'UPDATED_NEW',
    })
  );
  return result.Attributes?.[attribute] as number;
}

export async function queryItems<T>(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, any>
): Promise<T[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
  return (result.Items || []) as T[];
}

export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>
): Promise<void> {
  const updateExpression = Object.keys(updates)
    .map((k) => `#${k} = :${k}`)
    .join(', ');

  const expressionAttributeNames = Object.keys(updates).reduce(
    (acc, k) => ({ ...acc, [`#${k}`]: k }),
    {}
  );

  const expressionAttributeValues = Object.entries(updates).reduce(
    (acc, [k, v]) => ({ ...acc, [`:${k}`]: v }),
    {}
  );

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpression}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}
