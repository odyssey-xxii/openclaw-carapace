import { S3Client } from '@aws-sdk/client-s3';
import { MemoryStore } from './src/memory-store.js';
import { ContextManager } from './src/context-manager.js';
import { MemoryHook } from './src/memory-hook.js';
import type {
  CarapaceMemoryExtensionContext,
  HookContext,
  MemoryGetResult,
  MemorySetResult,
  MemoryDeleteResult,
  RememberResult,
} from './src/types.js';

let memoryStore: MemoryStore;
let contextManager: ContextManager;
let memoryHook: MemoryHook;

export function registerMemoryExtension(context: CarapaceMemoryExtensionContext): void {
  const { gateway, s3Client: providedS3Client, config = {} } = context;

  const {
    s3Bucket = process.env.CARAPACE_MEMORY_BUCKET || 'carapace-memory',
    s3Prefix = process.env.CARAPACE_MEMORY_PREFIX || 'users',
    maxMessagesPerSession = 1000,
    compactionThreshold = 500,
  } = config;

  // Initialize S3 client if not provided
  const s3Client = (providedS3Client as S3Client) || new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  memoryStore = new MemoryStore(s3Client, s3Bucket, s3Prefix);
  contextManager = new ContextManager(memoryStore, maxMessagesPerSession, compactionThreshold);
  memoryHook = new MemoryHook(memoryStore);

  // Register gateway methods for memory operations
  gateway.registerMethod('carapace.memory.list', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      if (!userId) {
        return {
          items: [],
          count: 0,
          error: 'userId is required',
        };
      }

      const result = await memoryStore.list(userId);
      return {
        items: result.items,
        count: result.count,
      };
    } catch (error) {
      return {
        items: [],
        count: 0,
      };
    }
  });

  gateway.registerMethod('carapace.memory.get', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const memoryName = args[1] as string;

      if (!userId || !memoryName) {
        return {
          success: false,
          error: 'userId and memoryName are required',
        } as MemoryGetResult;
      }

      const data = await memoryStore.get(userId, memoryName);
      if (!data) {
        return {
          success: false,
          error: `Memory '${memoryName}' not found`,
        } as MemoryGetResult;
      }

      return {
        success: true,
        data,
      } as MemoryGetResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve memory: ${error instanceof Error ? error.message : String(error)}`,
      } as MemoryGetResult;
    }
  });

  gateway.registerMethod('carapace.memory.set', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const memoryName = args[1] as string;
      const content = args[2] as Record<string, unknown>;

      if (!userId || !memoryName || !content) {
        return {
          success: false,
          error: 'userId, memoryName, and content are required',
        } as MemorySetResult;
      }

      const id = await memoryStore.set(userId, memoryName, content);
      return {
        success: true,
        id,
      } as MemorySetResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
      } as MemorySetResult;
    }
  });

  gateway.registerMethod('carapace.memory.delete', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const memoryName = args[1] as string;

      if (!userId || !memoryName) {
        return {
          success: false,
          error: 'userId and memoryName are required',
        } as MemoryDeleteResult;
      }

      await memoryStore.delete(userId, memoryName);
      return {
        success: true,
      } as MemoryDeleteResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
      } as MemoryDeleteResult;
    }
  });

  // Semantic gateway methods with shorter names for explicit remember operations
  gateway.registerMethod('memory.remember', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const key = args[1] as string;
      const content = args[2] as Record<string, unknown>;

      if (!userId || !key || !content) {
        return {
          success: false,
          error: 'userId, key, and content are required',
        } as RememberResult;
      }

      const id = await memoryStore.set(userId, key, content);
      return {
        success: true,
        key: id,
      } as RememberResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to remember: ${error instanceof Error ? error.message : String(error)}`,
      } as RememberResult;
    }
  });

  gateway.registerMethod('memory.recall', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const key = args[1] as string;

      if (!userId || !key) {
        return {
          success: false,
          error: 'userId and key are required',
        } as MemoryGetResult;
      }

      const data = await memoryStore.get(userId, key);
      if (!data) {
        return {
          success: false,
          error: `Memory '${key}' not found`,
        } as MemoryGetResult;
      }

      return {
        success: true,
        data,
      } as MemoryGetResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to recall: ${error instanceof Error ? error.message : String(error)}`,
      } as MemoryGetResult;
    }
  });

  gateway.registerMethod('memory.forget', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      const key = args[1] as string;

      if (!userId || !key) {
        return {
          success: false,
          error: 'userId and key are required',
        } as MemoryDeleteResult;
      }

      await memoryStore.delete(userId, key);
      return {
        success: true,
      } as MemoryDeleteResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to forget: ${error instanceof Error ? error.message : String(error)}`,
      } as MemoryDeleteResult;
    }
  });

  gateway.registerMethod('memory.list', async (...args: unknown[]) => {
    try {
      const userId = args[0] as string;
      if (!userId) {
        return {
          items: [],
          count: 0,
          error: 'userId is required',
        };
      }

      const result = await memoryStore.list(userId);
      return {
        items: result.items,
        count: result.count,
      };
    } catch (error) {
      return {
        items: [],
        count: 0,
      };
    }
  });

  // Register hooks for session lifecycle
  gateway.registerHook('before_agent_start', async (hookContext: HookContext) => {
    try {
      const { userId, sessionId } = hookContext;
      if (userId && sessionId) {
        await contextManager.loadContext(userId, sessionId);
        // Inject long-term memories into the context
        await contextManager.injectMemoriesIntoContext(userId, sessionId);
      }
    } catch (error) {
      console.error('Error loading context on agent start:', error);
    }
  });

  gateway.registerHook('message_processed', async (hookContext: HookContext) => {
    try {
      const { userId, message } = hookContext;
      if (userId && message) {
        // Check if this message contains "remember this" patterns
        await memoryHook.processMessage(userId, message);
      }
    } catch (error) {
      console.warn('Error processing memory hook:', error);
    }
  });

  gateway.registerHook('session_end', async (hookContext: HookContext) => {
    try {
      const { sessionId } = hookContext;
      if (sessionId) {
        await contextManager.closeSession(sessionId);
      }
    } catch (error) {
      console.error('Error saving context on session end:', error);
    }
  });
}

// Export for direct use in tests or other modules
export { MemoryStore, ContextManager, MemoryHook };
export type { MemoryEntry, SessionContext, RememberResult } from './src/types.js';
