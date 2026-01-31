export type MetricsSnapshot = {
  timestamp: number;
  date: string; // YYYY-MM-DD
  commands_executed: number;
  commands_blocked: number;
  commands_approved: number;
  sandbox_time_ms: number;
  channel_usage: Record<string, number>;
  token_usage: {
    input: number;
    output: number;
  };
};

export type AggregatedMetrics = {
  period: "daily" | "weekly" | "monthly";
  start_date: string;
  end_date: string;
  total_commands_executed: number;
  total_commands_blocked: number;
  total_commands_approved: number;
  approval_rate: number;
  block_rate: number;
  total_sandbox_time_ms: number;
  avg_sandbox_time_ms: number;
  channel_breakdown: Record<
    string,
    {
      commands: number;
      sandbox_time_ms: number;
      token_usage: { input: number; output: number };
    }
  >;
  total_tokens: {
    input: number;
    output: number;
  };
};

export type SecurityBreakdown = {
  green: number; // approved
  yellow: number; // blocked
  red: number; // errors
  timestamp: string;
};

export type CommandBreakdown = {
  command: string;
  count: number;
  approved: number;
  blocked: number;
  avg_duration_ms: number;
};

export type ChannelMetrics = {
  channel: string;
  commands: number;
  sandbox_time_ms: number;
  tokens_input: number;
  tokens_output: number;
  approval_rate: number;
};
