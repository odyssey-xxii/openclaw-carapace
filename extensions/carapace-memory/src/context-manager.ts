import type { SessionContext } from './types.js';
import { MemoryStore } from './memory-store.js';

export class ContextManager {
  private memoryStore: MemoryStore;
  private activeSessions: Map<string, SessionContext> = new Map();
  private maxMessagesPerSession: number;
  private compactionThreshold: number;

  constructor(memoryStore: MemoryStore, maxMessagesPerSession: number = 1000, compactionThreshold: number = 500) {
    this.memoryStore = memoryStore;
    this.maxMessagesPerSession = maxMessagesPerSession;
    this.compactionThreshold = compactionThreshold;
  }

  async loadContext(userId: string, sessionId: string): Promise<SessionContext> {
    // Check if session is already loaded
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Try to load from persistent storage
    const storedContext = await this.memoryStore.get(userId, `session:${sessionId}`);

    let context: SessionContext;
    if (storedContext) {
      context = storedContext as unknown as SessionContext;
    } else {
      // Create new context
      context = {
        userId,
        sessionId,
        messages: [],
        metadata: {},
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };
    }

    this.activeSessions.set(sessionId, context);
    return context;
  }

  async saveContext(context: SessionContext): Promise<void> {
    context.lastActivityAt = Date.now();

    // Compact if needed
    if (context.messages.length > this.compactionThreshold) {
      await this.compactMessages(context);
    }

    await this.memoryStore.set(context.userId, `session:${context.sessionId}`, {
      ...context,
    });
  }

  private async compactMessages(context: SessionContext): Promise<void> {
    // Keep the most recent messages and summarize older ones
    if (context.messages.length <= this.maxMessagesPerSession) {
      return;
    }

    const keep = Math.floor(this.maxMessagesPerSession * 0.7);
    const toCompact = context.messages.slice(0, -keep);

    // Create a summary entry for compacted messages
    if (toCompact.length > 0) {
      const firstTimestamp = toCompact[0].timestamp;
      const lastTimestamp = toCompact[toCompact.length - 1].timestamp;
      const messageCount = toCompact.length;

      const summary = {
        role: 'system' as const,
        content: `[COMPACTED: ${messageCount} messages from ${new Date(firstTimestamp).toISOString()} to ${new Date(lastTimestamp).toISOString()}]`,
        timestamp: firstTimestamp,
      };

      context.messages = [summary, ...context.messages.slice(-keep)];
    }
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const context = this.activeSessions.get(sessionId);
    if (!context) {
      throw new Error(`Session ${sessionId} not loaded`);
    }

    context.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // Auto-trim if exceeding max
    if (context.messages.length > this.maxMessagesPerSession) {
      context.messages = context.messages.slice(-this.maxMessagesPerSession);
    }
  }

  getContext(sessionId: string): SessionContext | null {
    return this.activeSessions.get(sessionId) || null;
  }

  async closeSession(sessionId: string): Promise<void> {
    const context = this.activeSessions.get(sessionId);
    if (context) {
      await this.saveContext(context);
      this.activeSessions.delete(sessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  async injectMemoriesIntoContext(
    userId: string,
    sessionId: string,
    query?: string,
    maxMemories: number = 10,
    maxTotalSize: number = 4000
  ): Promise<void> {
    const context = this.activeSessions.get(sessionId);
    if (!context) {
      throw new Error(`Session ${sessionId} not loaded`);
    }

    // Load all memories for this user
    const result = await this.memoryStore.list(userId);

    if (result.items.length === 0) {
      return;
    }

    // Filter out session memories
    let memories = result.items.filter(item => !item.name.startsWith('session:'));

    // Apply relevance filter if query provided
    if (query) {
      const queryLower = query.toLowerCase();
      memories = memories.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(queryLower);
        const contentStr = JSON.stringify(item.content).toLowerCase();
        const contentMatch = contentStr.includes(queryLower);
        return nameMatch || contentMatch;
      });
    }

    if (memories.length === 0) {
      return;
    }

    // Sort by most recently updated first
    memories.sort((a, b) => b.updatedAt - a.updatedAt);

    // Limit to maxMemories
    memories = memories.slice(0, maxMemories);

    // Build memory content respecting size limits
    const memoryLines: string[] = [];
    let totalSize = 0;

    for (const item of memories) {
      const contentStr = JSON.stringify(item.content);
      const maxContentSize = Math.max(200, Math.floor(maxTotalSize / memories.length));
      const truncatedContent = contentStr.length > maxContentSize ? contentStr.slice(0, maxContentSize) + '...' : contentStr;
      const memoryLine = `${item.name}: ${truncatedContent}`;

      if (totalSize + memoryLine.length <= maxTotalSize) {
        memoryLines.push(memoryLine);
        totalSize += memoryLine.length;
      } else {
        // Stop adding memories if we'd exceed total size
        break;
      }
    }

    if (memoryLines.length > 0) {
      const memoryContent = memoryLines.join('\n');
      context.messages.push({
        role: 'system',
        content: `[LONG-TERM MEMORIES]\n${memoryContent}`,
        timestamp: Date.now(),
      });
    }
  }
}
