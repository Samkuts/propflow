/**
 * S3 / Storage abstraction
 * ─────────────────────────────────────────────────────────────────────────────
 * When AWS credentials are present, uses real S3 presigned URLs.
 * When they are absent (local dev), returns placeholder URLs so the rest
 * of the app works without needing cloud credentials.
 */

import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
);

export const BUCKET = process.env.S3_BUCKET ?? 'property-management-docs';
export const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

export const s3Client = s3Configured
  ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/**
 * Generate a presigned POST that lets the browser upload directly to S3.
 * Max file size: 20 MB. URL expires in 5 minutes.
 */
export async function getPresignedUploadUrl(
  key: string,
  mimeType: string
): Promise<{ url: string; fields: Record<string, string> }> {
  if (!s3Client) {
    // Local dev fallback — frontend won't actually upload anywhere
    return { url: `http://localhost:4000/dev-uploads/${key}`, fields: {} };
  }

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 0, 20 * 1024 * 1024],
      ['eq', '$Content-Type', mimeType],
    ],
    Fields: { 'Content-Type': mimeType },
    Expires: 300,
  });

  return { url, fields };
}

/**
 * Generate a presigned GET URL for viewing/downloading a document.
 * Expires in 1 hour.
 */
export async function getPresignedDownloadUrl(key: string): Promise<string> {
  if (!s3Client) {
    return `http://localhost:4000/dev-uploads/${key}`;
  }

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
}

/**
 * Delete an object from S3. Safe to call even if not configured.
 */
export async function deleteS3Object(key: string): Promise<void> {
  if (!s3Client) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Build a canonical S3 key for a document upload.
 * Format: {managementCompanyId}/{context}/{contextId}/{timestamp}-{filename}
 */
export function buildFileKey(
  managementCompanyId: string,
  context: 'leases' | 'work-orders' | 'properties' | 'general',
  contextId: string,
  originalFilename: string
): string {
  const ext = originalFilename.split('.').pop() ?? 'bin';
  const safe = originalFilename
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return `${managementCompanyId}/${context}/${contextId}/${Date.now()}-${safe}`;
}
