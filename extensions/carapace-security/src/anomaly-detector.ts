export interface UserBaseline {
  userId: string;
  avgCommandsPerHour: number;
  commonCommands: Map<string, number>;  // command -> frequency
  typicalWorkingHours: { start: number; end: number };
  lastUpdated: Date;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;  // 0-1, higher = more anomalous
  factors: string[];
  recommendation: 'allow' | 'flag' | 'block';
}

export class AnomalyDetector {
  private baselines: Map<string, UserBaseline> = new Map();
  private recentCommands: Map<string, Array<{ command: string; timestamp: number }>> = new Map();

  async analyze(userId: string, command: string): Promise<AnomalyResult> {
    const factors: string[] = [];
    let score = 0;

    const baseline = this.baselines.get(userId);
    const recent = this.recentCommands.get(userId) || [];

    // Factor 1: Command frequency spike
    const hourAgo = Date.now() - 3600000;
    const recentCount = recent.filter(r => r.timestamp > hourAgo).length;
    if (baseline && recentCount > baseline.avgCommandsPerHour * 3) {
      score += 0.3;
      factors.push('Unusual command frequency spike');
    }

    // Factor 2: Unusual hours
    const hour = new Date().getHours();
    if (baseline && (hour < baseline.typicalWorkingHours.start || hour > baseline.typicalWorkingHours.end)) {
      score += 0.2;
      factors.push('Activity outside typical hours');
    }

    // Factor 3: Never-seen-before command pattern
    const cmdBase = command.split(' ')[0];
    if (baseline && !baseline.commonCommands.has(cmdBase)) {
      score += 0.2;
      factors.push('Uncommon command type');
    }

    // Factor 4: Rapid successive commands
    if (recent.length >= 2) {
      const timeDiff = Date.now() - recent[recent.length - 1].timestamp;
      if (timeDiff < 1000) {  // Less than 1 second
        score += 0.15;
        factors.push('Rapid command succession');
      }
    }

    // Track this command
    recent.push({ command, timestamp: Date.now() });
    if (recent.length > 100) recent.shift();
    this.recentCommands.set(userId, recent);

    return {
      isAnomaly: score >= 0.5,
      score,
      factors,
      recommendation: score >= 0.7 ? 'block' : score >= 0.5 ? 'flag' : 'allow'
    };
  }

  async updateBaseline(userId: string): Promise<void> {
    const recent = this.recentCommands.get(userId) || [];
    if (recent.length < 10) return;  // Need enough data

    const hourAgo = Date.now() - 3600000;
    const recentHour = recent.filter(r => r.timestamp > hourAgo);

    const cmdFreq = new Map<string, number>();
    for (const r of recent) {
      const cmd = r.command.split(' ')[0];
      cmdFreq.set(cmd, (cmdFreq.get(cmd) || 0) + 1);
    }

    const hours = recent.map(r => new Date(r.timestamp).getHours());

    this.baselines.set(userId, {
      userId,
      avgCommandsPerHour: recentHour.length,
      commonCommands: cmdFreq,
      typicalWorkingHours: {
        start: Math.min(...hours),
        end: Math.max(...hours)
      },
      lastUpdated: new Date()
    });
  }

  getBaseline(userId: string): UserBaseline | undefined {
    return this.baselines.get(userId);
  }

  resetBaseline(userId: string): void {
    this.baselines.delete(userId);
  }
}
