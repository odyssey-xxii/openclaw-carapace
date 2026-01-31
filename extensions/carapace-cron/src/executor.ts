import type { ExecutionContext, GatewayContext, JobExecutionResult } from './types.js';

export class Executor {
  private gateway: GatewayContext['gateway'];

  constructor(gateway: GatewayContext['gateway']) {
    this.gateway = gateway;
  }

  async execute(context: ExecutionContext, command: string): Promise<JobExecutionResult> {
    const startTime = Date.now();

    try {
      // Execute the command (could be a shell command, HTTP request, or custom handler)
      const output = await this.executeCommand(context, command);

      const result: JobExecutionResult = {
        jobId: context.jobId,
        executedAt: new Date(),
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
      };

      // Send result to channel
      await this.notifyChannel(context, result);

      return result;
    } catch (error) {
      const errorMsg = String(error);
      const result: JobExecutionResult = {
        jobId: context.jobId,
        executedAt: new Date(),
        success: false,
        error: errorMsg,
        executionTimeMs: Date.now() - startTime,
      };

      // Send error notification to channel
      await this.notifyChannel(context, result);

      throw error;
    }
  }

  private async executeCommand(context: ExecutionContext, command: string): Promise<string> {
    // Parse command to determine type
    if (command.startsWith('http://') || command.startsWith('https://')) {
      return this.executeHttpRequest(command);
    }

    if (command.startsWith('agent:')) {
      return this.executeAgentCommand(context, command.substring(6).trim());
    }

    // Default: treat as shell-like command
    return this.executeShellCommand(command);
  }

  private async executeHttpRequest(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return text.substring(0, 1000); // Limit output
    } catch (error) {
      throw new Error(`HTTP request failed: ${error}`);
    }
  }

  private async executeAgentCommand(_context: ExecutionContext, command: string): Promise<string> {
    // This would integrate with the agent system
    // For now, return a placeholder
    return `Agent command executed: ${command}`;
  }

  private async executeShellCommand(command: string): Promise<string> {
    // For security, only allow whitelisted commands in production
    // This is a simplified implementation
    const allowedPatterns = [
      /^echo\s+/,
      /^date$/,
      /^pwd$/,
      /^whoami$/,
    ];

    const isAllowed = allowedPatterns.some(pattern => pattern.test(command));

    if (!isAllowed) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // In production, use proper subprocess execution
    // For now, return a mock response
    return `Command executed: ${command}`;
  }

  private async notifyChannel(context: ExecutionContext, result: JobExecutionResult): Promise<void> {
    try {
      const message = this.formatResultMessage(result);
      await this.gateway.sendToChannel(context.channelId, context.userId, message);
    } catch (error) {
      console.error(`Failed to send channel notification: ${error}`);
      // Don't throw - notification failure shouldn't fail the job
    }
  }

  private formatResultMessage(result: JobExecutionResult): string {
    if (result.success) {
      return `Cron job ${result.jobId} executed successfully in ${result.executionTimeMs}ms.\n\nOutput:\n${result.output || '(no output)'}`;
    } else {
      return `Cron job ${result.jobId} failed after ${result.executionTimeMs}ms.\n\nError:\n${result.error}`;
    }
  }
}
