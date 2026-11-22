import * as Minio from 'minio';
import { loadEnv } from '../config/env.js';

let client: Minio.Client | null = null;

export function getMinio(): Minio.Client {
  if (!client) {
    const env = loadEnv();
    client = new Minio.Client({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
  }
  return client;
}

export async function putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
  await getMinio().putObject(bucket, key, body, body.length, { 'Content-Type': contentType });
}

export async function removeObject(bucket: string, key: string): Promise<void> {
  await getMinio().removeObject(bucket, key);
}

export async function statObject(bucket: string, key: string): Promise<boolean> {
  try {
    await getMinio().statObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

export async function getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream> {
  return getMinio().getObject(bucket, key);
}

export async function presignedGetUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
  return getMinio().presignedGetObject(bucket, key, ttlSeconds);
}

export async function ensureBuckets(): Promise<void> {
  const env = loadEnv();
  const minio = getMinio();
  for (const bucket of [env.MINIO_BUCKET_ATTENDANCE, env.MINIO_BUCKET_HELP]) {
    const exists = await minio.bucketExists(bucket);
    if (!exists) await minio.makeBucket(bucket);
    // Defense in depth: buckets must never be publicly accessible.
    try {
      await minio.setBucketPolicy(bucket, JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Deny', Principal: { AWS: ['*'] }, Action: ['s3:*'], Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`] }],
      }));
    } catch {
      // policy set is best-effort at startup; minio-init is the source of truth
    }
  }
}
