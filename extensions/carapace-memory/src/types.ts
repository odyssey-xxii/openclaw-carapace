export interface MemoryEntry {
  id: string;
  userId: string;
  name: string;
  content: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastActivityAt: number;
}

export interface MemoryListResult {
  items: MemoryEntry[];
  count: number;
}

export interface MemoryGetResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface MemorySetResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface MemoryDeleteResult {
  success: boolean;
  error?: string;
}

export interface OpenClawGateway {
  registerMethod(path: string, handler: (...args: unknown[]) => Promise<unknown> | unknown): void;
  registerHook(event: string, handler: (context: HookContext) => Promise<void> | void): void;
}

export interface HookContext {
  userId?: string;
  sessionId?: string;
  agentId?: string;
  data?: Record<string, unknown>;
  message?: string;
}

export interface RememberResult {
  success: boolean;
  key?: string;
  error?: string;
}

export interface CarapaceMemoryExtensionContext {
  gateway: OpenClawGateway;
  s3Client?: unknown;
  config?: {
    s3Bucket?: string;
    s3Prefix?: string;
    maxMessagesPerSession?: number;
    compactionThreshold?: number;
  };
}
