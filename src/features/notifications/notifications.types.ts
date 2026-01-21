// Notification types

export interface CreateNotificationInput {
  userId: string;  // Changed from teacherId to support all user types
  type?: 'success' | 'warning' | 'info' | 'mention' | 'default';
  title: string;
  message: string;
  actionLabel?: string | null;
  actionLink?: string | null;
  metadata?: any;
}

export interface GetNotificationsQuery {
  userId: string;  // Changed from teacherId
  isRead?: boolean;
  limit?: number;
  skip?: number;
}

export interface MarkAsReadInput {
  notificationId: string;
  userId: string;  // Changed from teacherId
}

export interface MarkAllAsReadInput {
  userId: string;  // Changed from teacherId
}

export interface DeleteNotificationInput {
  notificationId: string;
  userId: string;  // Changed from teacherId
}

export interface NotificationResponse {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionLabel: string | null;
  actionLink: string | null;
  metadata: any;
  createdAt: string;
}
