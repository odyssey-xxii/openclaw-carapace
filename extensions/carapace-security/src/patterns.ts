// GREEN: Safe, read-only commands with no side effects
export const GREEN_PATTERNS = [
  // Navigation and listing
  /^ls(\s|$)/,
  /^la\b/,
  /^ll\b/,
  /^pwd$/,
  /^tree(\s|$)/,
  /^find\s+/,

  // File reading
  /^cat\s/,
  /^head\s/,
  /^tail\s/,
  /^wc\s/,
  /^grep\s/,
  /^rg\s/,
  /^ag\s/,
  /^file\s/,
  /^less\s/,
  /^more\s/,
  /^bat\s/,

  // Information and help
  /^whoami$/,
  /^date$/,
  /^echo\s/,
  /^printf\s/,
  /^man\s/,
  /^help\s/,
  /^which\s/,
  /^whereis\s/,
  /^type\s/,
  /^history\b/,

  // Git read-only operations
  /^git\s+(status|log|show|diff|branch|tag|blame|reflog|remote)/,
  /^git\s+config\s+--list/,

  // Node/npm/yarn read-only
  /^node\s+(--version|-v)$/,
  /^npm\s+(list|view|info|outdated|audit(?!\s+fix)|help)/,
  /^npm\s+ls\b/,
  /^yarn\s+(list|info|why|help)/,
  /^bun\s+(--version|-v)$/,
  /^pnpm\s+(list|view)(?:\s|$)/,

  // Process information
  /^ps\b/,
  /^top\b/,
  /^htop\b/,
  /^uptime$/,
  /^free\b/,
  /^df\b/,
  /^du\b/,

  // Network read-only
  /^ping\s/,
  /^traceroute\s/,
  /^netstat\b/,
  /^ss\b/,
  /^curl\s.*-I(?:\s|$)/,
  /^curl\s.*--head(?:\s|$)/,
  /^wget\s.*--spider(?:\s|$)/,

  // System information
  /^uname\b/,
  /^lsb_release\b/,
  /^sw_vers\b/,
  /^lsof\b/,
  /^env$/,
  /^env\s+-i\s+[A-Z_]+=\s*[^\s]*\s+env$/,
  /^printenv\b/,

  // User information
  /^id\b/,
  /^groups\b/,
  /^w\b/,
  /^users\b/,
  /^who\b/,

  // Time/date operations
  /^date\b/,
  /^cal\b/,
];

// YELLOW: Commands requiring review - can modify files, install packages, clone repos
export const YELLOW_PATTERNS = [
  // Package management installs
  /^npm\s+(install|i|ci|add)(?:\s|$)/,
  /^npm\s+npm@.*$/,
  /^yarn\s+(add|install)(?:\s|$)/,
  /^bun\s+(add|install)(?:\s|$)/,
  /^pnpm\s+(install|i|add)(?:\s|$)/,
  /^pip\s+(install|i)(?:\s|$)/,
  /^pip3\s+(install|i)(?:\s|$)/,
  /^apt\s+(install|update|upgrade)(?:\s|$)/,
  /^apt-get\s+(install|update|upgrade)(?:\s|$)/,
  /^brew\s+(install|upgrade)(?:\s|$)/,
  /^gem\s+install(?:\s|$)/,

  // Git modifications
  /^git\s+(push|pull|fetch|commit|merge|rebase|cherry-pick|reset|checkout)/,
  /^git\s+add(?:\s|$)/,
  /^git\s+rm(?:\s|$)/,
  /^git\s+tag\s/,
  /^git\s+branch\s+(-d|-D|-m|-M)/,
  /^git\s+clone(?:\s|$)/,
  /^git\s+init(?:\s|$)/,

  // File operations (non-destructive)
  /^cp\s/,
  /^cp\s+-r(?:\s|$)/,
  /^mv\s/,
  /^mkdir\s/,
  /^mkdir\s+-p(?:\s|$)/,
  /^touch\s/,
  /^ln\s/,
  /^tar\s+(xf|xzf|xjf|xvf)/,
  /^unzip\s/,
  /^gunzip\s/,
  /^gzip\s/,
  /^zip\s/,

  // Text editing
  /^nano\s/,
  /^vi\s/,
  /^vim\s/,
  /^emacs\s/,
  /^sed\s/,
  /^awk\s/,
  /^perl\s/,

  // Build/compilation
  /^make(?:\s|$)/,
  /^cargo\s+(build|test)(?:\s|$)/,
  /^go\s+(build|test|run)(?:\s|$)/,
  /^python\s+setup\.py(?:\s|$)/,
  /^npm\s+run(?:\s|$)/,
  /^pnpm\s+run(?:\s|$)/,
  /^yarn\s+run(?:\s|$)/,
  /^bun\s+run(?:\s|$)/,

  // Docker/container operations
  /^docker\s+(build|run|exec|pull)(?:\s|$)/,
  /^docker-compose\s+(up|down|run)(?:\s|$)/,
  /^kubectl\s+(apply|create|set)(?:\s|$)/,

  // Archive operations that extract
  /^tar\s+(xf|xzf|xjf)(?:\s|$)/,
  /^untar\s/,

  // Network operations
  /^curl\s+(?!.*-I|.*--head)/,
  /^wget\s+(?!.*--spider)/,
  /^scp\s/,

  // Configuration modifications
  /^export\s+[A-Z_]+=/,
  /^alias\s+/,
];

// RED: Dangerous operations - destructive, credential access, system modification
export const RED_PATTERNS = [
  // Path traversal attacks
  /\.\.\//,
  /^cat\s+.*\.\.\//,
  /^ls\s+.*\.\.\//,
  /^cd\s+\.\.\//,

  // Absolute system paths
  /^(cat|less|more|head|tail|grep|rg)\s+\/(etc|var|usr|bin|sbin|opt|sys|proc)\b/,
  /^ls\s+\/(etc|var|usr|bin|sbin|opt|sys|proc)\b/,
  /^find\s+\/(etc|var|usr|bin|sbin|opt|sys|proc)\b/,

  // Home directory escapes
  /~\/\.\.\//,
  /^cat\s+~\/[^/]*\/\.ssh\b/,
  /^cat\s+~\/[^/]*\/\.keys\b/,

  // Symlink attacks
  /^ln\s+-s\s+\/(etc|var|usr|bin|sbin|opt|sys|proc)\b/,
  /^ln\s+-s\s+\/etc\/\b/,
  /readlink\s+\/(etc|var|usr|bin|sbin|opt|sys|proc)\b/,

  // Destructive file operations
  /rm\s+-rf/,
  /rm\s+.*-r.*f/,
  /^rm\s+\/(?:etc|usr|var|bin|lib|boot|dev|sys|proc)\b/,
  /^rmdir\s/,
  />\s*\/dev\/null\s+2>&1\s*&/,
  /\|\s*xargs\s+rm\b/,

  // Sudo and privilege escalation
  /^sudo\s+(?!-l)/,
  /^su\s+/,
  /^doas\s+/,
  /^pfexec\s+/,
  /visudo\b/,

  // Permission changes
  /^chmod\s+777/,
  /^chmod\s+\d*7\d*7\d*/,
  /^chown\s/,
  /^chgrp\s/,
  /^setfacl\s/,

  // Credential/secret exposure
  /\$\{?ANTHROPIC_API_KEY\}?/i,
  /\$\{?OPENAI_API_KEY\}?/i,
  /\$\{?AWS_SECRET_ACCESS_KEY\}?/i,
  /\$\{?GITHUB_TOKEN\}?/i,
  /\$\{?DATABASE_PASSWORD\}?/i,
  /\$\{?DB_PASSWORD\}?/i,
  /\$\{?PRIVATE_KEY\}?/i,
  /\.env\b/,
  /\.env\.local\b/,
  /credentials\b/,
  /secret\b/i,
  /\.pem\b/,
  /\.key\b/,

  // AWS/GCP/Azure credentials
  /AWS_[A-Z_]*(?:KEY|CREDENTIAL|SECRET|TOKEN)/i,
  /GOOGLE_APPLICATION_CREDENTIALS/i,
  /AZURE_SUBSCRIPTION_ID/i,
  /access_token|refresh_token/i,

  // EC2 metadata service access
  /169\.254\.169\.254/,
  /metadata\.google\.internal/,

  // System file modifications
  /^vim\s+\/etc\b/,
  /^nano\s+\/etc\b/,
  /^sed\s+.*\/etc\b/,
  /^systemctl\s+(?!status|is-active)/,
  /^service\s+(?!status)/,
  /^systemd\b/,

  // Network topology changes
  /^ifconfig\s+/,
  /^ip\s+link\s+/,
  /^ip\s+addr\s+/,
  /^ip\s+route\s+/,
  /^iptables\b/,
  /^firewall-cmd\s+/,

  // Package manager removals
  /^npm\s+uninstall\b/,
  /^npm\s+remove\b/,
  /^apt\s+remove\b/,
  /^apt-get\s+remove\b/,
  /^brew\s+uninstall\b/,
  /^pip\s+uninstall\b/,
  /^yum\s+remove\b/,

  // Kernel and module modifications
  /^insmod\s/,
  /^rmmod\s/,
  /^modprobe\b/,
  /^sysctl\s+-w/,

  // User/group modifications
  /^useradd\b/,
  /^userdel\b/,
  /^usermod\b/,
  /^passwd\b/,
  /^groupadd\b/,
  /^groupdel\b/,
  /^groupmod\b/,

  // Sensitive file reads
  /^cat\s+\/etc\/shadow\b/,
  /^cat\s+\/etc\/passwd\b/,
  /^cat\s+\/root\//,
  /^cat\s+~\/\.ssh\b/,

  // Disk/volume operations
  /^fdisk\s/,
  /^parted\s/,
  /^mkfs\b/,
  /^mkswap\b/,
  /^mount\s+-o.*exec/,
  /^umount\s/,

  // Backup/archive to external
  /^dd\s+of=/,
  /^tar\s+.*cf\s+\/dev\//,

  // Data destruction
  /^shred\s/,
  /^wipe\s/,
  /^secure\s+delete/,

  // Git force operations
  /^git\s+push\s+.*--force(?:-with-lease)?/,
  /^git\s+reset\s+--hard/,

  // Network tunneling
  /^ssh\s+-R\s/,
  /^ssh\s+-L\s/,
  /^ngrok\s/,

  // Stop/kill/reboot
  /^halt\b/,
  /^poweroff\b/,
  /^reboot\b/,
  /^shutdown\b/,
  /^kill\s+-9\s+1\b/,
];
