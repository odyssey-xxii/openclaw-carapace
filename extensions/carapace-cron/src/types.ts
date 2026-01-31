export interface CronJob {
  id: string;
  userId: string;
  name: string;
  description?: string;
  cronExpression: string;
  command: string;
  channelId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  executionCount: number;
  failureCount: number;
  lastError?: string;
  timezone?: string;
}

export interface JobExecutionResult {
  jobId: string;
  executedAt: Date;
  success: boolean;
  output?: string;
  error?: string;
  executionTimeMs: number;
}

export interface JobStore {
  saveJob(job: CronJob): Promise<void>;
  getJob(jobId: string): Promise<CronJob | null>;
  listJobs(userId: string): Promise<CronJob[]>;
  deleteJob(jobId: string): Promise<void>;
  updateJob(job: CronJob): Promise<void>;
  getJobsByUser(userId: string): Promise<CronJob[]>;
}

export interface S3Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExecutionContext {
  jobId: string;
  userId: string;
  channelId: string;
  variables?: Record<string, string>;
}

export interface SchedulerConfig {
  maxConcurrentExecutions?: number;
  executionTimeout?: number;
  retryPolicy?: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
  };
}

export interface GatewayContext {
  gateway: {
    registerMethod(path: string, handler: (...args: unknown[]) => Promise<unknown> | unknown): void;
    sendToChannel(channelId: string, userId: string, message: string): Promise<void>;
    getSharedService(name: string): unknown;
  };
  storage: S3Storage;
}
