import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({});

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

  return `https://${bucket}.s3.amazonaws.com/${key}`;
}
