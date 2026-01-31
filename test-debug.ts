import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixSecurityFootguns } from "./src/security/fix.js";

async function test() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-security-fix-"));
  const stateDir = path.join(tmp, "state");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.chmod(stateDir, 0o755);

  const configPath = path.join(stateDir, "openclaw.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      channels: {
        telegram: { groupPolicy: "open" },
        whatsapp: { groupPolicy: "open" },
      },
    }, null, 2),
    "utf-8"
  );
  await fs.chmod(configPath, 0o644);

  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: "",
  };

  const res = await fixSecurityFootguns({ env });
  console.log("Result:", JSON.stringify(res, null, 2));
}

test().catch(console.error);
