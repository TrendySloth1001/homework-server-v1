import { prisma } from '../../shared/lib/prisma';
import { NotFoundError, ValidationError } from '../../shared/lib/errors';
import type {
  CreateNotificationInput,
  GetNotificationsQuery,
  MarkAsReadInput,
  MarkAllAsReadInput,
  DeleteNotificationInput,
} from './notifications.types';

/**
 * Create a new notification
 */
export async function createNotificationService(data: CreateNotificationInput) {
  const { userId, title, message } = data;
    
  if (!(userId && title && message)) {
    throw new ValidationError(`userId, title, and message are required {data: ${JSON.stringify(data)}}`);
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      message,
    },
  });

  return notification;
}

/**
 * Get notifications for a user with filters
 */
export async function getNotificationsService(query: GetNotificationsQuery) {
  const { userId, isRead, limit = 50, skip = 0 } = query;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  const where: any = { userId };
  
  if (isRead !== undefined) {
    where.isRead = isRead;
  }

  const [notifications, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    totalCount,
    unreadCount,
    limit,
    skip,
  };
}

/**
 * Get single notification by ID
 */
export async function getNotificationByIdService(notificationId: string, userId: string) {
  if (!notificationId || !userId) {
    throw new ValidationError('notificationId and userId are required');
  }

  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!notification) {
    throw new NotFoundError('Notification', notificationId);
  }

  return notification;
}

/**
 * Mark notification as read
 */
export async function markAsReadService(data: MarkAsReadInput) {
  const { notificationId, userId } = data;

  if (!notificationId || !userId) {
    throw new ValidationError('notificationId and userId are required');
  }

  // Check if notification exists and belongs to user
  const existingNotification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!existingNotification) {
    throw new NotFoundError('Notification', notificationId);
  }

  const notification = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return notification;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsReadService(data: MarkAllAsReadInput) {
  const { userId } = data;

  if (!userId) {
    throw new ValidationError('userId is required');
  }

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: { isRead: true },
  });

  return {
    count: result.count,
    message: `Marked ${result.count} notification(s) as read`,
  };
}

/**
 * Delete notification
 */
export async function deleteNotificationService(data: DeleteNotificationInput) {
  const { notificationId, userId } = data;

  if (!notificationId || !userId) {
    throw new ValidationError('notificationId and userId are required');
  }

  // Check if notification exists and belongs to user
  const existingNotification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!existingNotification) {
    throw new NotFoundError('Notification', notificationId);
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return {
    message: 'Notification deleted successfully',
    deletedId: notificationId,
  };
}

/**
 * Delete all notifications for a user
 */
export async function deleteAllNotificationsService(userId: string) {
  if (!userId) {
    throw new ValidationError('userId is required');
  }

  const result = await prisma.notification.deleteMany({
    where: { userId },
  });

  return {
    count: result.count,
    message: `Deleted ${result.count} notification(s)`,
  };
}

/**
 * Helper: Create notification for AI generation completion
 */
export async function notifyAIGenerationComplete(
  userId: string,
  type: string,
  itemName: string,
  success: boolean
) {
  const title = success
    ? ` AI Generation Complete`
    : ` AI Generation Failed`;
  
  const message = success
    ? `${type} generation completed successfully for "${itemName}"`
    : `${type} generation failed for "${itemName}". Please try again.`;

  return createNotificationService({ userId, title, message });
}
