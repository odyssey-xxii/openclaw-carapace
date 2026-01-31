/**
 * Notification types supported by the system
 */
export enum NotificationType {
  COMMAND_BLOCKED = "command_blocked",
  APPROVAL_REQUIRED = "approval_required",
  TASK_COMPLETE = "task_complete",
  SYSTEM_ALERT = "system_alert",
}

/**
 * Notification severity levels
 */
export enum NotificationSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Supported notification channels
 */
export type NotificationChannel = "discord" | "slack" | "telegram" | "email" | "webhook";

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  userId: string;
  enabledChannels: NotificationChannel[];
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:MM format in user's timezone
  quietHoursEnd?: string;
  timezone: string;
  notificationTypes: Partial<Record<NotificationType, boolean>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queued notification
 */
export interface QueuedNotification {
  id: string;
  userId: string;
  channelId?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  deliveredAt?: Date;
  expiresAt: Date;
}

/**
 * Notification message to be sent
 */
export interface Notification {
  userId: string;
  channelId?: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  skipQueue?: boolean;
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  success: boolean;
  channel: NotificationChannel;
  timestamp: Date;
  error?: string;
  messageId?: string;
}

/**
 * Gateway context for storage and messaging
 */
export interface GatewayContext {
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  gateway: {
    sendToChannel: (channelId: string, userId: string, message: string) => Promise<void>;
    getSharedService: (name: string) => unknown;
  };
}
