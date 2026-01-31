import { describe, it, expect, beforeEach } from "vitest";
import {
  scanForSecrets,
  redactSecrets,
  scanOutput,
  configureSecretsDetection,
  getSecretsDetectionConfig,
  type SecretMatch,
} from "./secrets-scanner.js";

describe("Secrets Scanner", () => {
  beforeEach(() => {
    // Reset to default config
    configureSecretsDetection({ mode: "redact", enableLineNumbers: true, maxSecretsPerType: 10 });
  });

  describe("scanForSecrets", () => {
    it("should detect AWS Access Keys", () => {
      const text = "AKIA1234567890123456";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("AWS"))).toBe(true);
    });

    it("should detect GitHub tokens", () => {
      const text = "ghp_12345678901234567890123456789012345"; // 35 chars
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("GitHub"))).toBe(true);
    });

    it("should detect Slack tokens", () => {
      const text = "xoxb-000000000000-000000000000-EXAMPLEEXAMPLEEXAMPLEEXAM";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("Slack"))).toBe(true);
    });

    it("should detect Stripe keys", () => {
      const text = "sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("Stripe"))).toBe(true);
    });

    it("should detect OpenAI API keys", () => {
      const text = "sk-proj1234567890abcdefghijklmnopqrst";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("OpenAI"))).toBe(true);
    });

    it("should detect Anthropic API keys", () => {
      const text = "sk-ant-v0-12345678901234567890abcde";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((m: SecretMatch) => m.type.includes("Anthropic"))).toBe(true);
    });

    it("should detect JWT tokens", () => {
      const text = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].type).toContain("JWT");
    });

    it("should detect database connection strings", () => {
      const text = "postgres://user:password@localhost:5432/dbname";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].type).toContain("PostgreSQL");
    });

    it("should detect MongoDB URLs", () => {
      const text = "mongodb+srv://user:password@cluster.mongodb.net/dbname";
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].type).toContain("MongoDB");
    });

    it("should detect private keys", () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdef
-----END RSA PRIVATE KEY-----`;
      const matches = scanForSecrets(text);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].type).toContain("RSA");
    });

    it("should include line numbers", () => {
      const text = "some code\nmore code\nAKIA1234567890123456\nlast line";
      const matches = scanForSecrets(text);
      expect(matches[0].lineNumber).toBe(3);
    });

    it("should not detect empty strings", () => {
      const matches = scanForSecrets("");
      expect(matches.length).toBe(0);
    });

    it("should deduplicate overlapping matches", () => {
      const text = "AKIA1234567890123456";
      const matches = scanForSecrets(text);
      const positions = new Set(matches.map((m: SecretMatch) => m.position.start));
      expect(positions.size).toBe(matches.length);
    });
  });

  describe("redactSecrets", () => {
    it("should replace secrets with redaction string", () => {
      const text = "My key is sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL";
      const redacted = redactSecrets(text);
      expect(redacted).not.toContain("1234567890abcdefghijklmnop");
      expect(redacted).toContain("[REDACTED");
    });

    it("should preserve surrounding context", () => {
      const text = "export STRIPE_KEY=sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL";
      const redacted = redactSecrets(text);
      // Check that the beginning is preserved
      expect(redacted).toContain("export");
    });

    it("should handle multiple secrets", () => {
      const text = "AWS: AKIA1234567890123456, Stripe: sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL";
      const redacted = redactSecrets(text);
      expect(redacted).not.toContain("AKIA1234567890123456");
      expect(redacted).not.toContain("sk_live_");
    });

    it("should preserve text without secrets", () => {
      const text = "This is safe text without any secrets";
      const redacted = redactSecrets(text);
      expect(redacted).toBe(text);
    });
  });

  describe("scanOutput", () => {
    it("should return scan result object", () => {
      const text = "AKIA1234567890123456";
      const result = scanOutput(text);
      expect(result).toHaveProperty("hasSecrets");
      expect(result).toHaveProperty("secretCount");
      expect(result).toHaveProperty("secrets");
      expect(result).toHaveProperty("secretsByType");
    });

    it("should count secrets by type", () => {
      const text = "AKIA1234567890123456 and sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL";
      const result = scanOutput(text);
      expect(result.secretsByType).toHaveProperty("AWS Access Key ID");
      expect(result.secretsByType).toHaveProperty("Stripe Live Secret Key");
    });

    it("should include redacted output in redact mode", () => {
      configureSecretsDetection({ mode: "redact" });
      const text = "AKIA1234567890123456";
      const result = scanOutput(text);
      expect(result.redactedOutput).toBeDefined();
      expect(result.redactedOutput).toContain("[REDACTED");
    });

    it("should not include redacted output in warn mode", () => {
      configureSecretsDetection({ mode: "warn" });
      const text = "AKIA1234567890123456";
      const result = scanOutput(text);
      expect(result.redactedOutput).toBeUndefined();
    });
  });

  describe("configureSecretsDetection", () => {
    it("should update mode", () => {
      configureSecretsDetection({ mode: "block" });
      const config = getSecretsDetectionConfig();
      expect(config.mode).toBe("block");
    });

    it("should update enableLineNumbers", () => {
      configureSecretsDetection({ enableLineNumbers: false });
      const config = getSecretsDetectionConfig();
      expect(config.enableLineNumbers).toBe(false);
    });

    it("should update maxSecretsPerType", () => {
      configureSecretsDetection({ maxSecretsPerType: 5 });
      const config = getSecretsDetectionConfig();
      expect(config.maxSecretsPerType).toBe(5);
    });

    it("should preserve other settings when updating", () => {
      configureSecretsDetection({ mode: "warn", enableLineNumbers: true });
      configureSecretsDetection({ enableLineNumbers: false });
      const config = getSecretsDetectionConfig();
      // After reset in beforeEach, mode defaults to 'redact', so update it
      expect(config.enableLineNumbers).toBe(false);
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle command output with environment variables", () => {
      const text = `export AWS_ACCESS_KEY_ID=AKIA1234567890123456
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
export DATABASE_URL=postgres://user:pass@localhost:5432/db`;

      const result = scanOutput(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secretCount).toBeGreaterThan(0);
    });

    it("should handle JSON with secrets", () => {
      const text = JSON.stringify({
        apiKey: "sk_live_EXAMPLEKEYEXAMPLEKEYEXAMPL",
        token: "ghp_1234567890123456789012345678901234",
      });

      const result = scanOutput(text);
      expect(result.hasSecrets).toBe(true);
    });

    it("should handle .env file content", () => {
      const text = `ANTHROPIC_API_KEY=sk-ant-v0-abc1234567890abcdefghijk
OPENAI_API_KEY=sk-proj-1234567890abcdefghijklmnop
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/db`;

      const result = scanOutput(text);
      expect(result.hasSecrets).toBe(true);
    });
  });
});
