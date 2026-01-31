import * as fs from "node:fs";
import * as path from "node:path";
import type { MetricsSnapshot } from "./types.js";

export class MetricsCollector {
  private stateDir: string;
  private metricsDir: string;
  private currentMetrics: Map<string, MetricsSnapshot>;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.metricsDir = path.join(stateDir, "analytics", "metrics");
    this.currentMetrics = new Map();
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.metricsDir)) {
      fs.mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  private async loadTodayMetrics(): Promise<MetricsSnapshot> {
    const key = this.getTodayKey();

    if (this.currentMetrics.has(key)) {
      return this.currentMetrics.get(key)!;
    }

    const filePath = path.join(this.metricsDir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      this.currentMetrics.set(key, data);
      return data;
    }

    const metrics: MetricsSnapshot = {
      timestamp: Date.now(),
      date: key,
      commands_executed: 0,
      commands_blocked: 0,
      commands_approved: 0,
      sandbox_time_ms: 0,
      channel_usage: {},
      token_usage: { input: 0, output: 0 },
    };

    this.currentMetrics.set(key, metrics);
    return metrics;
  }

  private async saveTodayMetrics(metrics: MetricsSnapshot): Promise<void> {
    const filePath = path.join(this.metricsDir, `${metrics.date}.json`);
    fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2));
  }

  async recordCommandExecution(
    channelId: string,
    approved: boolean,
    blocked: boolean,
    durationMs: number,
  ): Promise<void> {
    const metrics = await this.loadTodayMetrics();

    metrics.commands_executed += 1;
    if (approved) {
      metrics.commands_approved += 1;
    }
    if (blocked) {
      metrics.commands_blocked += 1;
    }

    metrics.sandbox_time_ms += durationMs;

    if (!metrics.channel_usage[channelId]) {
      metrics.channel_usage[channelId] = 0;
    }
    metrics.channel_usage[channelId] += 1;

    metrics.timestamp = Date.now();
    await this.saveTodayMetrics(metrics);
  }

  async recordTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
    const metrics = await this.loadTodayMetrics();
    metrics.token_usage.input += inputTokens;
    metrics.token_usage.output += outputTokens;
    metrics.timestamp = Date.now();
    await this.saveTodayMetrics(metrics);
  }

  async getMetrics(date: string): Promise<MetricsSnapshot | null> {
    const filePath = path.join(this.metricsDir, `${date}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    return null;
  }

  async getMetricsRange(startDate: string, endDate: string): Promise<MetricsSnapshot[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const metrics: MetricsSnapshot[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const m = await this.getMetrics(dateStr);
      if (m) {
        metrics.push(m);
      }
    }

    return metrics;
  }

  async deleteOldMetrics(retentionDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    if (!fs.existsSync(this.metricsDir)) {
      return;
    }

    const files = fs.readdirSync(this.metricsDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const dateStr = file.replace(".json", "");
        if (dateStr < cutoffStr) {
          fs.unlinkSync(path.join(this.metricsDir, file));
        }
      }
    }
  }
}
