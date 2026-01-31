import parser from 'cron-parser';
import type { CronJob, SchedulerConfig, ExecutionContext } from './types.js';
import type { JobStore } from './types.js';
import type { Executor } from './executor.js';

interface ScheduledTask {
  jobId: string;
  timeout: NodeJS.Timeout;
  nextExecution: Date;
}

export class CronScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private jobStore: JobStore;
  private executor: Executor;
  private config: Required<SchedulerConfig>;
  private activeExecutions: number = 0;

  constructor(jobStore: JobStore, executor: Executor, config?: SchedulerConfig) {
    this.jobStore = jobStore;
    this.executor = executor;
    this.config = {
      maxConcurrentExecutions: config?.maxConcurrentExecutions ?? 5,
      executionTimeout: config?.executionTimeout ?? 300000, // 5 minutes
      retryPolicy: config?.retryPolicy ?? {
        enabled: true,
        maxRetries: 3,
        backoffMs: 5000,
      },
    };
  }

  async scheduleJob(job: CronJob): Promise<void> {
    if (!job.enabled) {
      return;
    }

    // Unschedule if already scheduled
    if (this.scheduledTasks.has(job.id)) {
      this.unscheduleJob(job.id);
    }

    try {
      // Validate cron expression
      const interval = parser.parseExpression(job.cronExpression, {
        tz: job.timezone,
      });

      const nextDate = interval.next().toDate();
      this.scheduleNext(job, nextDate);
    } catch (error) {
      console.error(`Failed to schedule job ${job.id}: ${error}`);
      job.lastError = String(error);
      await this.jobStore.updateJob(job);
    }
  }

  private scheduleNext(job: CronJob, nextDate: Date): void {
    const now = new Date();
    const delay = Math.max(0, nextDate.getTime() - now.getTime());

    job.nextExecutionAt = nextDate;

    const timeout = setTimeout(async () => {
      await this.executeJob(job);
    }, delay);

    this.scheduledTasks.set(job.id, {
      jobId: job.id,
      timeout,
      nextExecution: nextDate,
    });
  }

  private async executeJob(job: CronJob): Promise<void> {
    // Check concurrent execution limit
    if (this.activeExecutions >= this.config.maxConcurrentExecutions) {
      // Re-schedule immediately if at capacity
      this.scheduleNext(job, new Date());
      return;
    }

    this.activeExecutions++;

    try {
      const context: ExecutionContext = {
        jobId: job.id,
        userId: job.userId,
        channelId: job.channelId,
      };

      // Execute with timeout
      await Promise.race([
        this.executor.execute(context, job.command),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Job execution timeout')),
            this.config.executionTimeout,
          ),
        ),
      ]);

      job.lastExecutedAt = new Date();
      job.executionCount++;
      job.lastError = undefined;

      await this.jobStore.updateJob(job);

      // Schedule next execution
      try {
        const interval = parser.parseExpression(job.cronExpression, {
          tz: job.timezone,
        });
        interval.next(); // Advance past current
        const nextDate = interval.next().toDate();
        this.scheduleNext(job, nextDate);
      } catch (error) {
        console.error(`Failed to reschedule job ${job.id}: ${error}`);
      }
    } catch (error) {
      const errorMsg = String(error);
      job.lastError = errorMsg;
      job.failureCount++;

      await this.jobStore.updateJob(job);

      // Attempt retry
      if (
        this.config.retryPolicy.enabled &&
        job.failureCount <= this.config.retryPolicy.maxRetries
      ) {
        const retryDelay = this.config.retryPolicy.backoffMs * job.failureCount;
        const retryDate = new Date(Date.now() + retryDelay);
        this.scheduleNext(job, retryDate);
      } else {
        // Re-schedule for next normal execution
        try {
          const interval = parser.parseExpression(job.cronExpression, {
            tz: job.timezone,
          });
          const nextDate = interval.next().toDate();
          this.scheduleNext(job, nextDate);
        } catch (parseError) {
          console.error(`Failed to reschedule job ${job.id}: ${parseError}`);
        }
      }
    } finally {
      this.activeExecutions--;
    }
  }

  unscheduleJob(jobId: string): void {
    const task = this.scheduledTasks.get(jobId);
    if (task) {
      clearTimeout(task.timeout);
      this.scheduledTasks.delete(jobId);
    }
  }

  unscheduleAll(): void {
    for (const task of this.scheduledTasks.values()) {
      clearTimeout(task.timeout);
    }
    this.scheduledTasks.clear();
  }

  getScheduledJobs(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values());
  }

  isJobScheduled(jobId: string): boolean {
    return this.scheduledTasks.has(jobId);
  }
}
