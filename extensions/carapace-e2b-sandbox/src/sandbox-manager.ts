import type { SandboxStatus, PersistedSandboxState, ExecResult, SandboxConfig } from "./types.js";

// Dynamic import type for e2b Sandbox
type Sandbox = Awaited<ReturnType<typeof import("e2b").Sandbox.create>>;

interface UserSandbox {
  sandbox: Sandbox;
  sandboxId: string;
  createdAt: Date;
  lastActivity: Date;
  idleTimer?: ReturnType<typeof setTimeout>;
}

interface UserSession {
  [userId: string]: UserSandbox | undefined;
}

export class SandboxManager {
  private sandboxes: UserSession = {};
  private pendingCreations: Map<string, Promise<UserSandbox>> = new Map();
  private idleTimeoutMs: number;

  constructor(private config: SandboxConfig = {}) {
    this.idleTimeoutMs = (config.idleTimeoutMinutes || 50) * 60 * 1000;
  }

  async getOrCreate(userId: string): Promise<Sandbox> {
    const existing = this.sandboxes[userId];
    if (existing) {
      existing.lastActivity = new Date();
      this.resetIdleTimer(userId);
      return existing.sandbox;
    }

    const pending = this.pendingCreations.get(userId);
    if (pending) {
      return pending.then((us) => us.sandbox);
    }

    const creationPromise = this.doCreate(userId);
    this.pendingCreations.set(userId, creationPromise);

    try {
      const userSandbox = await creationPromise;
      return userSandbox.sandbox;
    } finally {
      this.pendingCreations.delete(userId);
    }
  }

  private async doCreate(userId: string): Promise<UserSandbox> {
    const { Sandbox } = await import("e2b");

    const apiKey = this.config.e2bApiKey || process.env.E2B_API_KEY;
    if (!apiKey) {
      throw new Error("E2B_API_KEY not configured");
    }

    const sandbox = await Sandbox.create({ apiKey });

    const userSandbox: UserSandbox = {
      sandbox,
      sandboxId: sandbox.sandboxId,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sandboxes[userId] = userSandbox;
    this.resetIdleTimer(userId);

    return userSandbox;
  }

  async execute(userId: string, command: string): Promise<ExecResult> {
    const sandbox = await this.getOrCreate(userId);
    const userSandbox = this.sandboxes[userId];
    if (!userSandbox) {
      return { success: false, error: "Sandbox not found", exitCode: 1 };
    }

    try {
      userSandbox.lastActivity = new Date();
      this.resetIdleTimer(userId);

      const result = await sandbox.commands.run(command, { timeoutMs: 30000 });
      return {
        success: true,
        output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Command execution failed",
        exitCode: 1,
      };
    }
  }

  async hibernate(userId: string): Promise<void> {
    const userSandbox = this.sandboxes[userId];
    if (!userSandbox) return;

    if (userSandbox.idleTimer) {
      clearTimeout(userSandbox.idleTimer);
    }

    try {
      await userSandbox.sandbox.pause();
      console.log(`[E2B] Hibernated sandbox for user ${userId}`);
    } catch (error) {
      console.error(`[E2B] Failed to hibernate sandbox for ${userId}:`, error);
      try {
        await userSandbox.sandbox.kill();
      } catch {
        // Ignore cleanup errors
      }
    }

    delete this.sandboxes[userId];
  }

  async resume(userId: string): Promise<Sandbox> {
    // TODO: Implement S3-backed resume when persistence is configured
    return this.getOrCreate(userId);
  }

  async terminate(userId: string): Promise<void> {
    const userSandbox = this.sandboxes[userId];
    if (!userSandbox) return;

    if (userSandbox.idleTimer) {
      clearTimeout(userSandbox.idleTimer);
    }

    try {
      await userSandbox.sandbox.kill();
      console.log(`[E2B] Terminated sandbox for user ${userId}`);
    } catch (error) {
      console.error(`[E2B] Failed to terminate sandbox for ${userId}:`, error);
    }

    delete this.sandboxes[userId];
  }

  async getStatus(userId: string): Promise<SandboxStatus> {
    const userSandbox = this.sandboxes[userId];
    if (!userSandbox) {
      return { active: false };
    }

    const uptime = Date.now() - userSandbox.createdAt.getTime();
    return {
      active: true,
      sandboxId: userSandbox.sandboxId,
      createdAt: userSandbox.createdAt.toISOString(),
      lastActivity: userSandbox.lastActivity.toISOString(),
      uptime,
    };
  }

  private resetIdleTimer(userId: string): void {
    const userSandbox = this.sandboxes[userId];
    if (!userSandbox) return;

    if (userSandbox.idleTimer) {
      clearTimeout(userSandbox.idleTimer);
    }

    userSandbox.idleTimer = setTimeout(async () => {
      console.log(`[E2B] Idle timeout for user ${userId}, hibernating sandbox...`);
      await this.hibernate(userId);
    }, this.idleTimeoutMs);
  }

  async terminateAll(): Promise<void> {
    const userIds = Object.keys(this.sandboxes);
    console.log(`[E2B] Terminating ${userIds.length} sandboxes...`);
    await Promise.all(userIds.map((userId) => this.terminate(userId)));
    console.log(`[E2B] All sandboxes terminated`);
  }
}

let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(config?: SandboxConfig): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager(config);
  }
  return sandboxManagerInstance;
}
