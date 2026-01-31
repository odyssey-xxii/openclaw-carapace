import Anthropic from "anthropic";
import type { ClassificationResult, SecurityLevel, ClassificationAction } from "./types.js";

export class LLMAuditor {
  private client: Anthropic;
  private model = "claude-3-5-haiku-20241022";

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Use Claude 3.5 Haiku to classify ambiguous commands
   * Falls back to YELLOW (ask) on errors for safety
   */
  async classifyCommand(command: string): Promise<ClassificationResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Classify this shell command into one of three security levels:

GREEN: Safe, read-only commands (ls, cat, git status, pwd, etc.)
YELLOW: Potentially risky but necessary (npm install, git push, mkdir, etc.) - requires approval
RED: Dangerous operations (rm -rf, sudo, credential access) - should be blocked

Command: "${command}"

Respond in this exact format:
LEVEL: [GREEN|YELLOW|RED]
ACTION: [allow|ask|block]
REASON: [Brief reason]

Be strict about safety. Err on the side of caution.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        return this.defaultClassification(command);
      }

      const result = this.parseAuditResponse(content.text, command);
      return result;
    } catch (error) {
      // Fail safe - default to YELLOW (ask)
      console.error("LLM auditor error:", error);
      return {
        command,
        level: "yellow",
        action: "ask",
        reason: "LLM audit error - defaulting to ask for safety",
        requiresApproval: true,
      };
    }
  }

  private parseAuditResponse(text: string, command: string): ClassificationResult {
    const levelMatch = text.match(/LEVEL:\s*(GREEN|YELLOW|RED)/i);
    const actionMatch = text.match(/ACTION:\s*(allow|ask|block)/i);
    const reasonMatch = text.match(/REASON:\s*(.+?)(?:\n|$)/i);

    const level = (levelMatch?.[1]?.toLowerCase() || "yellow") as SecurityLevel;
    const action = (actionMatch?.[1]?.toLowerCase() || "ask") as ClassificationAction;
    const reason = reasonMatch?.[1]?.trim() || "LLM classification";

    return {
      command,
      level,
      action,
      reason,
      requiresApproval: action === "ask",
    };
  }

  private defaultClassification(command: string): ClassificationResult {
    return {
      command,
      level: "yellow",
      action: "ask",
      reason: "Defaulting to ask - command requires review",
      requiresApproval: true,
    };
  }
}
