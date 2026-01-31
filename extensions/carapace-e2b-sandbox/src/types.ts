export type SandboxStatus = {
  active: boolean;
  sandboxId?: string;
  createdAt?: string;
  lastActivity?: string;
  uptime?: number;
};

export interface PersistedSandboxState {
  sandboxId: string;
  pausedAt: string;
  createdAt: string;
  userId: string;
}

export interface ExecResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

export interface SandboxConfig {
  e2bApiKey?: string;
  enablePersistence?: boolean;
  s3BucketName?: string;
  idleTimeoutMinutes?: number;
}
