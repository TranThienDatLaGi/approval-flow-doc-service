import { Client } from 'minio';

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || 'file-upload';

export async function ensureBucket(bucket: string = DEFAULT_BUCKET): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
  }
}

export async function uploadBuffer(
  buffer: Buffer,
  objectName: string,
  contentType: string,
  bucket: string = DEFAULT_BUCKET
): Promise<string> {
  await ensureBucket(bucket);
  await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  });
  return `/${bucket}/${objectName}`;
}

export async function downloadBuffer(objectPath: string): Promise<Buffer> {
  // objectPath format: "/bucket-name/path/to/file"
  const parts = objectPath.replace(/^\//, '').split('/');
  const bucket = parts[0];
  const objectName = parts.slice(1).join('/');

  const stream = await minioClient.getObject(bucket, objectName);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function getPresignedUrl(
  objectPath: string,
  expiry: number = 3600
): Promise<string> {
  const parts = objectPath.replace(/^\//, '').split('/');
  const bucket = parts[0];
  const objectName = parts.slice(1).join('/');
  return await minioClient.presignedGetObject(bucket, objectName, expiry);
}

export default minioClient;
