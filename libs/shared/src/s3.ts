import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: process.env.AWS_ENDPOINT,
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  forcePathStyle: !!process.env.AWS_ENDPOINT,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      }
    : undefined,
});

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  if (process.env.AWS_ENDPOINT) {
    const endpoint = process.env.AWS_ENDPOINT.replace(/\/$/, '');
    return `${endpoint}/${bucket}/${key}`;
  }

  return `https://${bucket}.s3.amazonaws.com/${key}`;
}
