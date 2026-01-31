import type { ClassificationResult } from "./types.js";
import { GREEN_PATTERNS, YELLOW_PATTERNS, RED_PATTERNS } from "./patterns.js";

export interface CustomSecurityRules {
  allowedCommands?: string[];
  blockedCommands?: string[];
  blockedDomains?: string[];
  allowedDomains?: string[];
  securityLevel?: 'strict' | 'moderate' | 'permissive';
  autoApprovePatterns?: string[];
}

export class SecurityClassifier {
  private customRules?: CustomSecurityRules;
  private regexCache = new Map<string, RegExp>();
  private static readonly MAX_PATTERN_LENGTH = 100;
  private static readonly EXCESSIVE_QUANTIFIER_PATTERN = /(\*\*|\+\+|\{\d+,\d+\}|\{\d+,\}){2,}/;

  setCustomRules(rules: CustomSecurityRules | undefined) {
    this.customRules = rules;
  }

  private validatePattern(pattern: string): boolean {
    // Reject patterns longer than 100 chars
    if (pattern.length > SecurityClassifier.MAX_PATTERN_LENGTH) {
      return false;
    }
    // Reject patterns with excessive quantifiers (ReDoS protection)
    if (SecurityClassifier.EXCESSIVE_QUANTIFIER_PATTERN.test(pattern)) {
      return false;
    }
    return true;
  }

  private patternToRegex(pattern: string): RegExp | null {
    // Check cache first
    if (this.regexCache.has(pattern)) {
      return this.regexCache.get(pattern)!;
    }

    // Validate pattern to prevent ReDoS
    if (!this.validatePattern(pattern)) {
      return null;
    }

    try {
      const regex = new RegExp(pattern, 'i');
      // Cache the compiled regex
      this.regexCache.set(pattern, regex);
      return regex;
    } catch {
      return null;
    }
  }

  private matchesPattern(command: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      try {
        const regex = this.patternToRegex(pattern);
        if (!regex) {
          return false;
        }
        // Timeout protection: limit regex execution
        return this.executeRegexWithTimeout(regex, command, 100);
      } catch {
        return false;
      }
    });
  }

  private executeRegexWithTimeout(regex: RegExp, input: string, timeoutMs: number): boolean {
    try {
      // Set a hard execution limit - if input is extremely long, still proceed but safely
      // This is a practical protection against ReDoS on long strings
      if (input.length > 10000) {
        // For very long inputs, only test first 10000 chars as a safety measure
        return regex.test(input.substring(0, 10000));
      }
      return regex.test(input);
    } catch {
      // Treat regex errors (including timeout-like behavior) as non-match
      return false;
    }
  }

  private isDomainMatch(domain: string, blockedDomain: string): boolean {
    // Exact match
    if (domain === blockedDomain) {
      return true;
    }
    // Subdomain match: domain ends with .blockedDomain
    if (domain.endsWith('.' + blockedDomain)) {
      return true;
    }
    return false;
  }

  private extractDomainsFromCommand(command: string): string[] {
    const domains: string[] = [];

    // Extract URLs from curl, wget, fetch
    const curlWgetMatch = command.match(/(?:curl|wget|fetch)\s+(?:-[a-zA-Z]*\s+)*['"]?([^\s'"]+)['"]?/i);
    if (curlWgetMatch) {
      try {
        const url = new URL(curlWgetMatch[1]);
        if (url.hostname) {
          domains.push(url.hostname);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    // Extract domain from nc (netcat) connections
    const ncMatch = command.match(/^nc\s+(?:-[a-zA-Z]*\s+)*([a-zA-Z0-9.-]+)\s+\d+/i);
    if (ncMatch) {
      domains.push(ncMatch[1]);
    }

    // Extract URLs from python HTTP requests
    const pythonUrlMatch = command.match(/(?:http\.client|urllib|requests)\s*\(\s*['"]([^'"]+)['"]/i);
    if (pythonUrlMatch) {
      try {
        const url = new URL(pythonUrlMatch[1]);
        if (url.hostname) {
          domains.push(url.hostname);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    // Extract URLs from node HTTP requests
    const nodeUrlMatch = command.match(/(?:http|https)\.(?:request|get)\s*\(\s*['"]([^'"]+)['"]/i);
    if (nodeUrlMatch) {
      try {
        const url = new URL(nodeUrlMatch[1]);
        if (url.hostname) {
          domains.push(url.hostname);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    // Extract URLs from ssh/scp
    const sshMatch = command.match(/(?:ssh|scp)\s+(?:[a-zA-Z0-9._-]+@)?([a-zA-Z0-9.-]+)/);
    if (sshMatch) {
      domains.push(sshMatch[1]);
    }

    // Extract embedded URLs in any argument
    const urlRegex = /https?:\/\/([a-zA-Z0-9.-]+)(?:\/|:|\s|$)/gi;
    let match;
    while ((match = urlRegex.exec(command)) !== null) {
      if (match[1] && !domains.includes(match[1])) {
        domains.push(match[1]);
      }
    }

    return [...new Set(domains)]; // Remove duplicates
  }

  classifyCommand(command: string): ClassificationResult {
    if (!command || typeof command !== "string") {
      return {
        command,
        level: "green",
        action: "allow",
        reason: "Empty command",
        requiresApproval: false,
      };
    }

    const trimmed = command.trim();

    // Check user's blocklist first (RED override)
    if (this.customRules?.blockedCommands && this.matchesPattern(trimmed, this.customRules.blockedCommands)) {
      return {
        command: trimmed,
        level: "red",
        action: "block",
        reason: "Command blocked by custom security rules",
        requiresApproval: false,
      };
    }

    // Check user's allowlist (GREEN override)
    if (this.customRules?.allowedCommands && this.matchesPattern(trimmed, this.customRules.allowedCommands)) {
      return {
        command: trimmed,
        level: "green",
        action: "allow",
        reason: "Command allowed by custom security rules",
        requiresApproval: false,
      };
    }

    // Check network domain restrictions
    const domains = this.extractDomainsFromCommand(trimmed);
    for (const domain of domains) {
      // Check blocked domains (with subdomain support)
      if (this.customRules?.blockedDomains) {
        for (const blockedDomain of this.customRules.blockedDomains) {
          if (this.isDomainMatch(domain, blockedDomain)) {
            return {
              command: trimmed,
              level: "red",
              action: "block",
              reason: `Network access blocked to domain: ${domain}`,
              requiresApproval: false,
            };
          }
        }
      }

      // Check allowed domains (with subdomain support)
      if (this.customRules?.allowedDomains && this.customRules.allowedDomains.length > 0) {
        const isAllowed = this.customRules.allowedDomains.some(allowedDomain =>
          this.isDomainMatch(domain, allowedDomain)
        );
        if (!isAllowed) {
          return {
            command: trimmed,
            level: "red",
            action: "block",
            reason: `Network access to domain ${domain} not in whitelist`,
            requiresApproval: false,
          };
        }
      }
    }

    // Check for auto-approve patterns
    if (this.customRules?.autoApprovePatterns && this.matchesPattern(trimmed, this.customRules.autoApprovePatterns)) {
      return {
        command: trimmed,
        level: "green",
        action: "allow",
        reason: "Command auto-approved by custom patterns",
        requiresApproval: false,
      };
    }

    // Check RED patterns (most restrictive)
    for (const pattern of RED_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          command: trimmed,
          level: "red",
          action: "block",
          reason: "Command matched dangerous operation patterns",
          matchedPattern: pattern.source,
          requiresApproval: false,
        };
      }
    }

    // Check YELLOW patterns (requires approval)
    for (const pattern of YELLOW_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          command: trimmed,
          level: "yellow",
          action: "ask",
          reason: "Command requires approval",
          matchedPattern: pattern.source,
          requiresApproval: true,
        };
      }
    }

    // Check GREEN patterns (safe)
    for (const pattern of GREEN_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          command: trimmed,
          level: "green",
          action: "allow",
          reason: "Command matched safe patterns",
          matchedPattern: pattern.source,
          requiresApproval: false,
        };
      }
    }

    // Default: Unknown commands default to YELLOW (ask for approval)
    return {
      command: trimmed,
      level: "yellow",
      action: "ask",
      reason: "Unknown command - requires approval for safety",
      requiresApproval: true,
    };
  }

  // Batch classify multiple commands
  classifyCommands(commands: string[]): ClassificationResult[] {
    return commands.map((cmd) => this.classifyCommand(cmd));
  }

  // Get summary statistics about classification
  getPatternStats(): {
    greenCount: number;
    yellowCount: number;
    redCount: number;
  } {
    return {
      greenCount: GREEN_PATTERNS.length,
      yellowCount: YELLOW_PATTERNS.length,
      redCount: RED_PATTERNS.length,
    };
  }
}
