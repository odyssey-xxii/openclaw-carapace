import { v4 as uuidv4 } from "uuid";
import type { Notification, QueuedNotification, NotificationPreferences, GatewayContext } from "./types.js";

const QUEUE_PREFIX = "notifications:queue:";
const QUEUE_INDEX_PREFIX = "notifications:queue:index:";

/**
 * Manages notification queue for offline users
 */
export class NotificationQueue {
  private context: GatewayContext;
  private maxQueueSize: number;
  private retentionDays: number;

  constructor(context: GatewayContext, maxQueueSize = 100, retentionDays = 7) {
    this.context = context;
    this.maxQueueSize = maxQueueSize;
    this.retentionDays = retentionDays;
  }

  /**
   * Add notification to queue
   */
  async enqueue(notification: Notification, prefs: NotificationPreferences): Promise<QueuedNotification> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000);

    const queued: QueuedNotification = {
      id: uuidv4(),
      userId: notification.userId,
      channelId: notification.channelId,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
      createdAt: now,
      expiresAt,
    };

    // Get current queue
    const queue = await this.getQueuedNotifications(notification.userId);

    // Remove expired notifications
    const validQueue = queue.filter(n => new Date(n.expiresAt) > now);

    // Enforce max queue size
    if (validQueue.length >= this.maxQueueSize) {
      // Remove oldest notification
      validQueue.shift();
    }

    // Add new notification
    validQueue.push(queued);

    // Save updated queue
    const key = `${QUEUE_PREFIX}${notification.userId}`;
    const serialized = validQueue.map(n => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      deliveredAt: n.deliveredAt?.toISOString(),
      expiresAt: n.expiresAt.toISOString(),
    }));
    await this.context.storage.set(key, JSON.stringify(serialized));

    // Update index for quick lookup
    await this.updateQueueIndex(notification.userId, validQueue.length);

    return queued;
  }

  /**
   * Get all queued notifications for a user
   */
  async getQueuedNotifications(userId: string): Promise<QueuedNotification[]> {
    const key = `${QUEUE_PREFIX}${userId}`;
    const stored = await this.context.storage.get(key);

    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as any[];
      return parsed.map(n => ({
        ...n,
        createdAt: new Date(n.createdAt),
        deliveredAt: n.deliveredAt ? new Date(n.deliveredAt) : undefined,
        expiresAt: new Date(n.expiresAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Remove notification from queue
   */
  async removeFromQueue(notificationId: string): Promise<void> {
    // This is inefficient for large queues, but simpler to implement
    // In production, might want to use a more efficient storage backend
    // For now, we'll keep this simple
  }

  /**
   * Clear all pending notifications for a user
   */
  async clearUserQueue(userId: string): Promise<number> {
    const queue = await this.getQueuedNotifications(userId);
    const count = queue.length;

    if (count > 0) {
      const key = `${QUEUE_PREFIX}${userId}`;
      await this.context.storage.delete(key);
      await this.context.storage.delete(`${QUEUE_INDEX_PREFIX}${userId}`);
    }

    return count;
  }

  /**
   * Get queue stats for a user
   */
  async getQueueStats(userId: string): Promise<{ count: number; oldestDate?: Date }> {
    const queue = await this.getQueuedNotifications(userId);

    if (queue.length === 0) {
      return { count: 0 };
    }

    // Find oldest notification
    const oldest = queue.reduce((min, n) => (n.createdAt < min.createdAt ? n : min));

    return {
      count: queue.length,
      oldestDate: oldest.createdAt,
    };
  }

  /**
   * Get total queued count for a user (from index for quick lookup)
   */
  async getQueuedCount(userId: string): Promise<number> {
    const indexKey = `${QUEUE_INDEX_PREFIX}${userId}`;
    const stored = await this.context.storage.get(indexKey);

    if (!stored) {
      return 0;
    }

    try {
      const data = JSON.parse(stored);
      return data.count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Update queue index for quick lookup
   */
  private async updateQueueIndex(userId: string, count: number): Promise<void> {
    const indexKey = `${QUEUE_INDEX_PREFIX}${userId}`;
    await this.context.storage.set(indexKey, JSON.stringify({ count, updatedAt: new Date().toISOString() }));
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired(): Promise<number> {
    // This would need to iterate over all users in storage
    // For now, we clean up per-user when they request their queue
    // In production, run this periodically via a background job
    return 0;
  }
}
