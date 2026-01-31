import { v4 as uuidv4 } from "uuid";
import type {
  Notification,
  DeliveryResult,
  QueuedNotification,
  NotificationPreferences,
  NotificationType,
  GatewayContext,
} from "./types.js";
import { PreferencesManager } from "./preferences.js";
import { NotificationQueue } from "./queue.js";

/**
 * Core notification service handling delivery and queuing
 */
export class NotificationService {
  private context: GatewayContext;
  private preferencesManager: PreferencesManager;
  private queue: NotificationQueue;
  private logger: any;

  constructor(context: GatewayContext, logger?: any) {
    this.context = context;
    this.preferencesManager = new PreferencesManager(context);
    this.queue = new NotificationQueue(context);
    this.logger = logger || console;
  }

  /**
   * Send a notification to user's preferred channels
   * If user is offline, queue for later delivery
   */
  async sendNotification(notification: Notification): Promise<DeliveryResult[]> {
    const { userId, type, skipQueue = false } = notification;

    // Get user preferences
    const prefs = await this.preferencesManager.getPreferences(userId);

    // Check if notification type is enabled
    if (!this.isNotificationTypeEnabled(prefs, type)) {
      this.logger.debug(`Notification type ${type} disabled for user ${userId}`);
      return [];
    }

    // Check quiet hours
    const inQuietHours = await this.preferencesManager.isInQuietHours(userId);
    if (inQuietHours && !this.isCritical(notification)) {
      this.logger.debug(`User ${userId} in quiet hours, queuing notification`);
      await this.queue.enqueue(notification, prefs);
      return [];
    }

    // Attempt delivery to enabled channels
    const results: DeliveryResult[] = [];
    let deliverySucceeded = false;

    for (const channel of prefs.enabledChannels) {
      try {
        await this.deliverToChannel(notification, channel, prefs);
        results.push({
          success: true,
          channel,
          timestamp: new Date(),
          messageId: uuidv4(),
        });
        deliverySucceeded = true;
      } catch (error) {
        this.logger.warn(
          `Failed to deliver notification to channel ${channel}: ${error instanceof Error ? error.message : String(error)}`
        );
        results.push({
          success: false,
          channel,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // If delivery failed and not skipping queue, queue the notification
    if (!deliverySucceeded && !skipQueue) {
      await this.queue.enqueue(notification, prefs);
    }

    return results;
  }

  /**
   * Deliver notification to a specific channel
   */
  private async deliverToChannel(
    notification: Notification,
    channel: string,
    _prefs: NotificationPreferences
  ): Promise<void> {
    const { userId, channelId, title, message } = notification;

    // Format the message
    const formattedMessage = this.formatMessage(notification);

    if (channelId) {
      // Send to specific channel
      await this.context.gateway.sendToChannel(channelId, userId, formattedMessage);
    } else {
      // Try to get default channel ID from gateway service
      // For now, we'll just send to a generic channel endpoint
      // In production, this would resolve the channel ID from a channel registry
      const channelService = this.context.gateway.getSharedService(channel);
      if (channelService && typeof channelService === "object") {
        const service = channelService as any;
        if (service.send && typeof service.send === "function") {
          await service.send(userId, formattedMessage);
        } else {
          throw new Error(`Channel service ${channel} does not support send operation`);
        }
      } else {
        throw new Error(`Channel service ${channel} not available`);
      }
    }
  }

  /**
   * Deliver all queued notifications for a user
   */
  async deliverQueuedNotifications(userId: string): Promise<number> {
    const notifications = await this.queue.getQueuedNotifications(userId);
    let deliveredCount = 0;

    for (const notification of notifications) {
      try {
        const results = await this.sendNotification({
          userId,
          type: notification.type,
          severity: notification.severity,
          title: notification.title,
          message: notification.message,
          metadata: notification.metadata,
          skipQueue: true, // Don't re-queue if delivery fails
        });

        if (results.some(r => r.success)) {
          await this.queue.removeFromQueue(notification.id);
          deliveredCount++;
        }
      } catch (error) {
        this.logger.error(`Error delivering queued notification ${notification.id}: ${error}`);
      }
    }

    return deliveredCount;
  }

  /**
   * Get pending notifications for a user
   */
  async getPendingNotifications(userId: string): Promise<QueuedNotification[]> {
    return this.queue.getQueuedNotifications(userId);
  }

  /**
   * Clear all pending notifications for a user
   */
  async clearPendingNotifications(userId: string): Promise<number> {
    return this.queue.clearUserQueue(userId);
  }

  /**
   * Check if notification type is enabled in preferences
   */
  private isNotificationTypeEnabled(prefs: NotificationPreferences, type: NotificationType): boolean {
    const enabled = prefs.notificationTypes[type];
    return enabled !== false; // Default to true if not explicitly disabled
  }

  /**
   * Check if notification is critical (should bypass quiet hours)
   */
  private isCritical(notification: Notification): boolean {
    return notification.severity === "critical";
  }

  /**
   * Format notification for delivery
   */
  private formatMessage(notification: Notification): string {
    const { title, message, severity, type } = notification;
    const prefix = this.getSeverityPrefix(severity);
    const header = `${prefix} [${type.toUpperCase()}]`;
    const body = `${header} ${title}\n${message}`;

    if (notification.metadata && Object.keys(notification.metadata).length > 0) {
      const meta = Object.entries(notification.metadata)
        .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
        .join("\n");
      return `${body}\n\nMetadata:\n${meta}`;
    }

    return body;
  }

  /**
   * Get severity emoji prefix
   */
  private getSeverityPrefix(severity: string): string {
    switch (severity) {
      case "critical":
        return "🚨";
      case "high":
        return "⚠️";
      case "medium":
        return "ℹ️";
      case "low":
        return "💡";
      default:
        return "📢";
    }
  }
}
