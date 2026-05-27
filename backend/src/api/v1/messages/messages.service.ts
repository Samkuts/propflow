import { prisma } from '../../../lib/prisma';

export async function getInbox(userId: string, managementCompanyId: string) {
  const messages = await prisma.message.findMany({
    where: {
      recipientId: userId,
      managementCompanyId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Attach sender names
  const senderIds = [...new Set(messages.map((m) => m.senderId))];
  const senders = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  const senderMap = Object.fromEntries(senders.map((s) => [s.id, s]));

  return messages.map((m) => ({ ...m, sender: senderMap[m.senderId] ?? null }));
}

export async function getSent(userId: string, managementCompanyId: string) {
  const messages = await prisma.message.findMany({
    where: { senderId: userId, managementCompanyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const recipientIds = [...new Set(messages.map((m) => m.recipientId))];
  const recipients = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
  const rMap = Object.fromEntries(recipients.map((r) => [r.id, r]));

  return messages.map((m) => ({ ...m, recipient: rMap[m.recipientId] ?? null }));
}

export async function getUnreadCount(userId: string, managementCompanyId: string): Promise<number> {
  return prisma.message.count({
    where: { recipientId: userId, managementCompanyId, isRead: false, deletedAt: null },
  });
}

export async function sendMessage(input: {
  senderId: string;
  recipientId: string;
  subject?: string;
  body: string;
  workOrderId?: string;
  managementCompanyId: string;
}) {
  // Verify recipient exists in this company
  const recipient = await prisma.user.findFirst({
    where: { id: input.recipientId, managementCompanyId: input.managementCompanyId, deletedAt: null },
  });
  if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');

  return prisma.message.create({
    data: {
      senderId: input.senderId,
      recipientId: input.recipientId,
      subject: input.subject,
      body: input.body,
      managementCompanyId: input.managementCompanyId,
      ...(input.workOrderId && { workOrderId: input.workOrderId }),
      channel: 'IN_APP',
    },
  });
}

export async function markRead(id: string, userId: string, managementCompanyId: string) {
  const msg = await prisma.message.findFirst({
    where: { id, recipientId: userId, managementCompanyId, deletedAt: null },
  });
  if (!msg) throw new Error('NOT_FOUND');
  return prisma.message.update({ where: { id }, data: { isRead: true } });
}

export async function markAllRead(userId: string, managementCompanyId: string) {
  return prisma.message.updateMany({
    where: { recipientId: userId, managementCompanyId, isRead: false, deletedAt: null },
    data: { isRead: true },
  });
}

const BROADCAST_RECIPIENT_CAP = 500;

export async function broadcastMessage(input: {
  managementCompanyId: string;
  senderId: string;
  body: string;
  subject?: string;
  propertyId?: string;
}): Promise<{ sent: number }> {
  // Find active tenants in scope
  const tenants = await prisma.tenant.findMany({
    where: {
      managementCompanyId: input.managementCompanyId,
      deletedAt: null,
      ...(input.propertyId && {
        lease: {
          unit: { propertyId: input.propertyId },
          status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
          deletedAt: null,
        },
      }),
      ...(!input.propertyId && {
        lease: {
          status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] },
          deletedAt: null,
        },
      }),
    },
    include: { user: { select: { id: true } } },
    take: BROADCAST_RECIPIENT_CAP,
  });

  const recipientUserIds = [
    ...new Set(tenants.map((t) => t.userId).filter(Boolean) as string[]),
  ];

  if (recipientUserIds.length === 0) return { sent: 0 };

  await prisma.$transaction(
    recipientUserIds.map((recipientId) =>
      prisma.message.create({
        data: {
          senderId: input.senderId,
          recipientId,
          subject: input.subject,
          body: input.body,
          managementCompanyId: input.managementCompanyId,
          channel: 'IN_APP',
        },
      })
    )
  );

  return { sent: recipientUserIds.length };
}

/** Get all users in the company that the current user can message. */
export async function getRecipients(managementCompanyId: string, excludeUserId: string) {
  return prisma.user.findMany({
    where: {
      managementCompanyId,
      deletedAt: null,
      id: { not: excludeUserId },
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
  });
}
