import { MemoryStore } from './memory-store.js';

export class MemoryHook {
  private memoryStore: MemoryStore;
  private rememberPatterns: RegExp[];

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;

    // Regex patterns to detect "remember this" intentions
    this.rememberPatterns = [
      /remember\s+(?:that\s+)?(?:i\s+)?(.+?)(?:\.|$)/gi,
      /i\s+(?:want\s+)?to\s+(?:note|save|store|record)\s+(?:that\s+)?(.+?)(?:\.|$)/gi,
      /save\s+(?:this|that)\s+for\s+(?:later|future|next\s+time)\s*:?\s*(.+?)(?:\.|$)/gi,
      /note:\s*(.+?)(?:\.|$)/gi,
      /memorize\s+(?:that\s+)?(.+?)(?:\.|$)/gi,
    ];
  }

  async processMessage(userId: string, message: string): Promise<boolean> {
    for (const pattern of this.rememberPatterns) {
      const matches = message.matchAll(pattern);

      for (const match of matches) {
        const content = match[1]?.trim();
        if (content && content.length > 0) {
          // Generate a key from the content (use first few words + timestamp)
          const words = content.split(/\s+/).slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
          const key = `note-${words}-${Date.now()}`;

          try {
            await this.memoryStore.set(userId, key, {
              content,
              detectedAt: Date.now(),
              originalMessage: message,
              source: 'auto-detected',
            });

            return true; // Memory was saved
          } catch (error) {
            console.warn(`Failed to auto-save memory: ${error}`);
          }
        }
      }
    }

    return false; // No memory patterns detected
  }
}
