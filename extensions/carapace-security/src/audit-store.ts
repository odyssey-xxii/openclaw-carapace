import { randomUUID } from "crypto";
import type { AuditLogEntry, AuditStats, SecurityLevel, ClassificationAction } from "./types.js";

export class AuditStore {
  private entries: AuditLogEntry[] = [];
  private readonly MAX_ENTRIES = 10000;
  private stats: AuditStats = {
    total: 0,
    byLevel: { green: 0, yellow: 0, red: 0 },
    byAction: { allow: 0, ask: 0, block: 0 },
    approvalRate: 0,
    lastUpdate: new Date(),
  };

  /**
   * Create a new audit log entry
   */
  createEntry(
    command: string,
    level: SecurityLevel,
    action: ClassificationAction,
    reason: string,
    userId?: string,
    channelId?: string
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      command,
      level,
      action,
      reason,
      createdAt: new Date(),
      userId,
      channelId,
    };

    // Add to store
    this.entries.unshift(entry); // Newest first

    // Trim old entries if we exceed max
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.pop();
    }

    // Update stats
    this.updateStats();

    return entry;
  }

  /**
   * Update an existing audit log entry
   */
  updateEntry(entryId: string, updates: Partial<AuditLogEntry>): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) {
      throw new Error(`Audit entry not found: ${entryId}`);
    }

    Object.assign(entry, updates);
    this.updateStats();
  }

  /**
   * Get audit entries with optional filtering
   */
  getEntries(
    userId?: string,
    options: {
      limit?: number;
      offset?: number;
      level?: SecurityLevel;
      action?: ClassificationAction;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): AuditLogEntry[] {
    const { limit = 50, offset = 0, level, action, startDate, endDate } = options;

    let filtered = this.entries;

    if (userId) {
      filtered = filtered.filter((e) => e.userId === userId);
    }

    if (level) {
      filtered = filtered.filter((e) => e.level === level);
    }

    if (action) {
      filtered = filtered.filter((e) => e.action === action);
    }

    if (startDate) {
      filtered = filtered.filter((e) => e.createdAt >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((e) => e.createdAt <= endDate);
    }

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get audit statistics
   */
  getStats(userId?: string, days: number = 7): AuditStats {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const entries = this.getEntries(userId, { startDate, endDate, limit: 100000 });

    const stats: AuditStats = {
      total: entries.length,
      byLevel: { green: 0, yellow: 0, red: 0 },
      byAction: { allow: 0, ask: 0, block: 0 },
      approvalRate: 0,
      lastUpdate: new Date(),
    };

    let askCount = 0;
    let approvedCount = 0;

    for (const entry of entries) {
      stats.byLevel[entry.level]++;
      stats.byAction[entry.action]++;

      if (entry.action === "ask") {
        askCount++;
        if (entry.approved) {
          approvedCount++;
        }
      }
    }

    stats.approvalRate = askCount > 0 ? approvedCount / askCount : 0;

    return stats;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.updateStats();
  }

  /**
   * Get total number of entries
   */
  getCount(): number {
    return this.entries.length;
  }

  private updateStats(): void {
    this.stats = {
      total: this.entries.length,
      byLevel: { green: 0, yellow: 0, red: 0 },
      byAction: { allow: 0, ask: 0, block: 0 },
      approvalRate: 0,
      lastUpdate: new Date(),
    };

    let askCount = 0;
    let approvedCount = 0;

    for (const entry of this.entries) {
      this.stats.byLevel[entry.level]++;
      this.stats.byAction[entry.action]++;

      if (entry.action === "ask") {
        askCount++;
        if (entry.approved) {
          approvedCount++;
        }
      }
    }

    this.stats.approvalRate = askCount > 0 ? approvedCount / askCount : 0;
  }
}

let instance: AuditStore | null = null;

export function getAuditStore(): AuditStore {
  if (!instance) {
    instance = new AuditStore();
  }
  return instance;
}
