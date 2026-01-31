import type {
  AggregatedMetrics,
  ChannelMetrics,
  CommandBreakdown,
  MetricsSnapshot,
  SecurityBreakdown,
} from "./types.js";
import { MetricsCollector } from "./metrics-collector.js";

export class MetricsAggregator {
  constructor(private collector: MetricsCollector) {}

  private parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  private getDayRange(period: "daily" | "weekly" | "monthly"): [string, string] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;

    if (period === "daily") {
      start = new Date(today);
    } else if (period === "weekly") {
      start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    const startStr = start.toISOString().split("T")[0];
    const endStr = today.toISOString().split("T")[0];

    return [startStr, endStr];
  }

  async aggregate(period: "daily" | "weekly" | "monthly"): Promise<AggregatedMetrics> {
    const [startDate, endDate] = this.getDayRange(period);
    const metrics = await this.collector.getMetricsRange(startDate, endDate);

    if (metrics.length === 0) {
      return {
        period,
        start_date: startDate,
        end_date: endDate,
        total_commands_executed: 0,
        total_commands_blocked: 0,
        total_commands_approved: 0,
        approval_rate: 0,
        block_rate: 0,
        total_sandbox_time_ms: 0,
        avg_sandbox_time_ms: 0,
        channel_breakdown: {},
        total_tokens: { input: 0, output: 0 },
      };
    }

    let total_commands_executed = 0;
    let total_commands_blocked = 0;
    let total_commands_approved = 0;
    let total_sandbox_time_ms = 0;
    const channel_breakdown: Record<
      string,
      { commands: number; sandbox_time_ms: number; token_usage: { input: number; output: number } }
    > = {};
    let total_tokens = { input: 0, output: 0 };

    for (const metric of metrics) {
      total_commands_executed += metric.commands_executed;
      total_commands_blocked += metric.commands_blocked;
      total_commands_approved += metric.commands_approved;
      total_sandbox_time_ms += metric.sandbox_time_ms;
      total_tokens.input += metric.token_usage.input;
      total_tokens.output += metric.token_usage.output;

      for (const [channel, count] of Object.entries(metric.channel_usage)) {
        if (!channel_breakdown[channel]) {
          channel_breakdown[channel] = {
            commands: 0,
            sandbox_time_ms: 0,
            token_usage: { input: 0, output: 0 },
          };
        }
        channel_breakdown[channel].commands += count;
        // Distribute sandbox time proportionally
        const proportion = count / metric.commands_executed || 0;
        channel_breakdown[channel].sandbox_time_ms += metric.sandbox_time_ms * proportion;
        // Distribute tokens proportionally
        channel_breakdown[channel].token_usage.input += metric.token_usage.input * proportion;
        channel_breakdown[channel].token_usage.output += metric.token_usage.output * proportion;
      }
    }

    const approval_rate =
      total_commands_executed > 0
        ? Math.round((total_commands_approved / total_commands_executed) * 10000) / 100
        : 0;
    const block_rate =
      total_commands_executed > 0
        ? Math.round((total_commands_blocked / total_commands_executed) * 10000) / 100
        : 0;

    const avg_sandbox_time_ms =
      total_commands_executed > 0
        ? Math.round(total_sandbox_time_ms / total_commands_executed)
        : 0;

    return {
      period,
      start_date: startDate,
      end_date: endDate,
      total_commands_executed,
      total_commands_blocked,
      total_commands_approved,
      approval_rate,
      block_rate,
      total_sandbox_time_ms,
      avg_sandbox_time_ms,
      channel_breakdown,
      total_tokens,
    };
  }

  async getSecurityBreakdown(period: "daily" | "weekly" | "monthly"): Promise<SecurityBreakdown> {
    const [startDate, endDate] = this.getDayRange(period);
    const metrics = await this.collector.getMetricsRange(startDate, endDate);

    let approved = 0;
    let blocked = 0;
    const red = 0; // errors not tracked yet, placeholder

    for (const metric of metrics) {
      approved += metric.commands_approved;
      blocked += metric.commands_blocked;
    }

    return {
      green: approved,
      yellow: blocked,
      red,
      timestamp: new Date().toISOString(),
    };
  }

  async getCommandBreakdown(period: "daily" | "weekly" | "monthly"): Promise<CommandBreakdown[]> {
    const aggregated = await this.aggregate(period);
    // This is a simplified breakdown; in production, track command names separately
    return [
      {
        command: "total",
        count: aggregated.total_commands_executed,
        approved: aggregated.total_commands_approved,
        blocked: aggregated.total_commands_blocked,
        avg_duration_ms: aggregated.avg_sandbox_time_ms,
      },
    ];
  }

  async getChannelUsage(period: "daily" | "weekly" | "monthly"): Promise<ChannelMetrics[]> {
    const aggregated = await this.aggregate(period);
    return Object.entries(aggregated.channel_breakdown).map(([channel, data]) => ({
      channel,
      commands: data.commands,
      sandbox_time_ms: data.sandbox_time_ms,
      tokens_input: Math.round(data.token_usage.input),
      tokens_output: Math.round(data.token_usage.output),
      approval_rate:
        data.commands > 0
          ? Math.round(((data.commands / aggregated.total_commands_executed) * 100) * 100) / 100
          : 0,
    }));
  }
}
