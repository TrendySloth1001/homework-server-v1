// Notification types

export interface CreateNotificationInput {
  userId: string;  // Changed from teacherId to support all user types
  title: string;
  message: string;
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
