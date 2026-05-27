import { prisma } from '../../../lib/prisma';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteS3Object,
  buildFileKey,
} from '../../../lib/s3';

export interface RequestUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  leaseId?: string;
  workOrderId?: string;
  propertyId?: string;
  managementCompanyId: string;
  uploadedBy: string;
}

/**
 * Generate a presigned S3 upload URL and create a Document record.
 * The document is considered "pending" until the client confirms the upload,
 * but for simplicity we create it immediately (uploads rarely fail).
 */
export async function requestUpload(input: RequestUploadInput) {
  const context = input.leaseId
    ? 'leases'
    : input.workOrderId
    ? 'work-orders'
    : input.propertyId
    ? 'properties'
    : 'general';
  const contextId = input.leaseId ?? input.workOrderId ?? input.propertyId ?? input.managementCompanyId;

  const fileKey = buildFileKey(
    input.managementCompanyId,
    context,
    contextId,
    input.fileName
  );

  const { url, fields } = await getPresignedUploadUrl(fileKey, input.mimeType);

  const document = await prisma.document.create({
    data: {
      name: input.fileName,
      fileKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
      ...(input.leaseId && { leaseId: input.leaseId }),
      ...(input.workOrderId && { workOrderId: input.workOrderId }),
      ...(input.propertyId && { propertyId: input.propertyId }),
    },
  });

  return { document, uploadUrl: url, fields };
}

/**
 * List documents for a lease or work order.
 */
export async function listDocuments(filters: {
  leaseId?: string;
  workOrderId?: string;
  propertyId?: string;
  managementCompanyId: string;
}) {
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(filters.leaseId && { leaseId: filters.leaseId }),
      ...(filters.workOrderId && { workOrderId: filters.workOrderId }),
      ...(filters.propertyId && { propertyId: filters.propertyId }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a short-lived presigned download URL for a document.
 */
export async function getDownloadUrl(
  id: string,
  managementCompanyId: string
): Promise<string> {
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: {
      lease: { select: { unit: { select: { property: { select: { managementCompanyId: true } } } } } },
      workOrder: { select: { managementCompanyId: true } },
      property: { select: { managementCompanyId: true } },
    },
  });

  if (!doc) throw new Error('NOT_FOUND');

  // Verify ownership
  const docCompanyId =
    doc.lease?.unit?.property?.managementCompanyId ??
    doc.workOrder?.managementCompanyId ??
    doc.property?.managementCompanyId;
  if (docCompanyId && docCompanyId !== managementCompanyId) throw new Error('NOT_FOUND');

  return getPresignedDownloadUrl(doc.fileKey);
}

/**
 * Soft-delete a document and remove from S3.
 */
export async function deleteDocument(
  id: string,
  managementCompanyId: string
): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: {
      lease: { select: { unit: { select: { property: { select: { managementCompanyId: true } } } } } },
      workOrder: { select: { managementCompanyId: true } },
      property: { select: { managementCompanyId: true } },
    },
  });

  if (!doc) throw new Error('NOT_FOUND');

  const docCompanyId =
    doc.lease?.unit?.property?.managementCompanyId ??
    doc.workOrder?.managementCompanyId ??
    doc.property?.managementCompanyId;
  if (docCompanyId && docCompanyId !== managementCompanyId) throw new Error('NOT_FOUND');

  await Promise.all([
    prisma.document.update({ where: { id }, data: { deletedAt: new Date() } }),
    deleteS3Object(doc.fileKey),
  ]);
}
