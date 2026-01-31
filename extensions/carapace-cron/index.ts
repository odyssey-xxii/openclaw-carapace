import { S3JobStore } from './src/job-store.js';
import { CronScheduler } from './src/scheduler.js';
import { Executor } from './src/executor.js';
import type { CronJob, GatewayContext } from './src/types.js';

export { S3JobStore } from './src/job-store.js';
export { CronScheduler } from './src/scheduler.js';
export { Executor } from './src/executor.js';
export type {
  CronJob,
  JobExecutionResult,
  JobStore,
  S3Storage,
  ExecutionContext,
  SchedulerConfig,
  GatewayContext,
} from './src/types.js';

let jobStore: S3JobStore | null = null;
let scheduler: CronScheduler | null = null;
let executor: Executor | null = null;

export function initializeCronExtension(context: GatewayContext): void {
  // Initialize job store with S3 storage
  jobStore = new S3JobStore(context.storage);

  // Initialize executor
  executor = new Executor(context.gateway);

  // Initialize scheduler
  scheduler = new CronScheduler(jobStore, executor, {
    maxConcurrentExecutions: 5,
    executionTimeout: 300000,
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      backoffMs: 5000,
    },
  });
}

export function getScheduler(): CronScheduler {
  if (!scheduler) {
    throw new Error('Cron extension not initialized. Call initializeCronExtension first.');
  }
  return scheduler;
}

export function getJobStore(): S3JobStore {
  if (!jobStore) {
    throw new Error('Cron extension not initialized. Call initializeCronExtension first.');
  }
  return jobStore;
}

export function getExecutor(): Executor {
  if (!executor) {
    throw new Error('Cron extension not initialized. Call initializeCronExtension first.');
  }
  return executor;
}

// Generate a unique job ID
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Validate cron expression
function validateCronExpression(cronExpr: string): boolean {
  try {
    const parser = require('cron-parser');
    parser.parseExpression(cronExpr);
    return true;
  } catch {
    return false;
  }
}

// OpenClaw plugin export
export default function createCronPlugin() {
  return {
    name: 'carapace-cron',
    version: '1.0.0',
    description: 'Scheduled task execution for Carapace agents',

    async initialize(context: {
      config: Record<string, unknown>;
      gateway: {
        registerMethod: (path: string, handler: unknown) => void;
        sendToChannel: (channelId: string, userId: string, message: string) => Promise<void>;
        getSharedService: (name: string) => unknown;
      };
      storage: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
    }) {
      // Initialize the extension
      initializeCronExtension({
        gateway: context.gateway,
        storage: context.storage,
      });

      const store = getJobStore();
      const sched = getScheduler();

      // Register gateway methods
      context.gateway.registerMethod('carapace.cron.list', async (...args: unknown[]) => {
        try {
          const userId = args[0] as string;
          const jobs = await store.getJobsByUser(userId);
          return {
            success: true,
            data: jobs,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.create', async (...args: unknown[]) => {
        try {
          const data = args[0] as Record<string, unknown>;
          const userId = args[1] as string;

          const { cronExpression, command, channelId, name, description, timezone } = data;

          // Validate required fields
          if (!cronExpression || !command || !channelId || !name) {
            throw new Error('Missing required fields: cronExpression, command, channelId, name');
          }

          // Validate cron expression
          if (!validateCronExpression(String(cronExpression))) {
            throw new Error('Invalid cron expression');
          }

          const job: CronJob = {
            id: generateJobId(),
            userId,
            name: String(name),
            description: description ? String(description) : undefined,
            cronExpression: String(cronExpression),
            command: String(command),
            channelId: String(channelId),
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            executionCount: 0,
            failureCount: 0,
            timezone: timezone ? String(timezone) : undefined,
          };

          await store.saveJob(job);
          await sched.scheduleJob(job);

          return {
            success: true,
            data: job,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.delete', async (...args: unknown[]) => {
        try {
          const jobId = args[0] as string;

          sched.unscheduleJob(jobId);
          await store.deleteJob(jobId);

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.pause', async (...args: unknown[]) => {
        try {
          const jobId = args[0] as string;

          const job = await store.getJob(jobId);
          if (!job) {
            throw new Error('Job not found');
          }

          job.enabled = false;
          job.updatedAt = new Date();
          await store.updateJob(job);
          sched.unscheduleJob(jobId);

          return {
            success: true,
            data: job,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.resume', async (...args: unknown[]) => {
        try {
          const jobId = args[0] as string;

          const job = await store.getJob(jobId);
          if (!job) {
            throw new Error('Job not found');
          }

          job.enabled = true;
          job.updatedAt = new Date();
          await store.updateJob(job);
          await sched.scheduleJob(job);

          return {
            success: true,
            data: job,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.get', async (...args: unknown[]) => {
        try {
          const jobId = args[0] as string;

          const job = await store.getJob(jobId);
          if (!job) {
            throw new Error('Job not found');
          }

          return {
            success: true,
            data: job,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.update', async (...args: unknown[]) => {
        try {
          const jobId = args[0] as string;
          const updates = args[1] as Record<string, unknown>;

          const job = await store.getJob(jobId);
          if (!job) {
            throw new Error('Job not found');
          }

          // Update allowed fields
          if (updates.name !== undefined) job.name = String(updates.name);
          if (updates.description !== undefined) job.description = String(updates.description);
          if (updates.cronExpression !== undefined) {
            const expr = String(updates.cronExpression);
            if (!validateCronExpression(expr)) {
              throw new Error('Invalid cron expression');
            }
            job.cronExpression = expr;
          }
          if (updates.command !== undefined) job.command = String(updates.command);
          if (updates.timezone !== undefined) job.timezone = String(updates.timezone);

          job.updatedAt = new Date();

          // Reschedule if enabled
          if (job.enabled) {
            sched.unscheduleJob(jobId);
            await sched.scheduleJob(job);
          }

          await store.updateJob(job);

          return {
            success: true,
            data: job,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      context.gateway.registerMethod('carapace.cron.status', async (...args: unknown[]) => {
        try {
          const userId = args[0] as string;

          const jobs = await store.getJobsByUser(userId);
          const scheduled = sched.getScheduledJobs();

          return {
            success: true,
            data: {
              totalJobs: jobs.length,
              enabledJobs: jobs.filter(j => j.enabled).length,
              scheduledJobs: scheduled.length,
              activeExecutions: scheduled.length,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      });

      return {
        status: 'initialized',
        services: {
          jobStore: store,
          scheduler: sched,
          executor: getExecutor(),
        },
      };
    },
  };
}
