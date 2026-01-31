import type { CronJob, JobStore, S3Storage } from './types.js';

export class S3JobStore implements JobStore {
  private storage: S3Storage;
  private jobsCache: Map<string, CronJob> = new Map();

  constructor(storage: S3Storage) {
    this.storage = storage;
  }

  async saveJob(job: CronJob): Promise<void> {
    const key = this.getJobKey(job.id);
    const data = JSON.stringify(this.serializeJob(job));
    await this.storage.set(key, data);
    this.jobsCache.set(job.id, job);
  }

  async getJob(jobId: string): Promise<CronJob | null> {
    // Check cache first
    if (this.jobsCache.has(jobId)) {
      return this.jobsCache.get(jobId) || null;
    }

    const key = this.getJobKey(jobId);
    const data = await this.storage.get(key);

    if (!data) {
      return null;
    }

    const job = this.deserializeJob(JSON.parse(data));
    this.jobsCache.set(jobId, job);
    return job;
  }

  async deleteJob(jobId: string): Promise<void> {
    const key = this.getJobKey(jobId);
    await this.storage.delete(key);
    this.jobsCache.delete(jobId);
  }

  async updateJob(job: CronJob): Promise<void> {
    await this.saveJob(job);
  }

  async listJobs(userId: string): Promise<CronJob[]> {
    // This is a simple implementation that loads from cache
    // In production, you'd want to implement proper S3 listing
    const jobs: CronJob[] = [];
    for (const job of this.jobsCache.values()) {
      if (job.userId === userId) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  async getJobsByUser(userId: string): Promise<CronJob[]> {
    return this.listJobs(userId);
  }

  private getJobKey(jobId: string): string {
    return `cron/jobs/${jobId}.json`;
  }

  private serializeJob(job: CronJob): Record<string, unknown> {
    return {
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      lastExecutedAt: job.lastExecutedAt?.toISOString(),
      nextExecutionAt: job.nextExecutionAt?.toISOString(),
    };
  }

  private deserializeJob(data: Record<string, unknown>): CronJob {
    return {
      ...data,
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
      lastExecutedAt: data.lastExecutedAt ? new Date(data.lastExecutedAt as string) : undefined,
      nextExecutionAt: data.nextExecutionAt ? new Date(data.nextExecutionAt as string) : undefined,
    } as CronJob;
  }
}
