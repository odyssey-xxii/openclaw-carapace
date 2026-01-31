import { TelegramBridge } from './src/telegram-bridge.js';
import { DiscordBridge } from './src/discord-bridge.js';
import { SlackBridge } from './src/slack-bridge.js';
import { WhatsAppBridgeImpl } from './src/whatsapp-bridge.js';
import type { StorageAdapter, EncryptionAdapter, ChannelCredentials } from './src/types.js';

export interface OpenClawGateway {
  registerMethod(path: string, handler: (...args: unknown[]) => Promise<unknown> | unknown): void;
  // TODO: Add full OpenClaw gateway interface as needed
}

export interface CarapaceExtensionContext {
  gateway: OpenClawGateway;
  storage: StorageAdapter;
  encryption: EncryptionAdapter;
}

let bridges: {
  telegram?: TelegramBridge;
  discord?: DiscordBridge;
  slack?: SlackBridge;
  whatsapp?: WhatsAppBridgeImpl;
} = {};

export function registerChannelsExtension(context: CarapaceExtensionContext): void {
  const { gateway, storage, encryption } = context;

  bridges = {
    telegram: new TelegramBridge(storage, encryption),
    discord: new DiscordBridge(storage, encryption),
    slack: new SlackBridge(storage, encryption),
    whatsapp: new WhatsAppBridgeImpl(storage, encryption),
  };

  // Telegram channel methods
  gateway.registerMethod('carapace.telegram.connect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const credentials = args[1] as ChannelCredentials;
    const status = await bridges.telegram!.connect(userId, credentials);
    return {
      success: true,
      data: status,
    };
  });

  gateway.registerMethod('carapace.telegram.disconnect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    await bridges.telegram!.disconnect(userId);
    return {
      success: true,
    };
  });

  gateway.registerMethod('carapace.telegram.status', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const status = await bridges.telegram!.status(userId);
    return {
      success: true,
      data: status,
    };
  });

  // Discord channel methods
  gateway.registerMethod('carapace.discord.connect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const credentials = args[1] as ChannelCredentials;
    const status = await bridges.discord!.connect(userId, credentials);
    return {
      success: true,
      data: status,
    };
  });

  gateway.registerMethod('carapace.discord.disconnect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    await bridges.discord!.disconnect(userId);
    return {
      success: true,
    };
  });

  gateway.registerMethod('carapace.discord.status', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const status = await bridges.discord!.status(userId);
    return {
      success: true,
      data: status,
    };
  });

  // Slack channel methods
  gateway.registerMethod('carapace.slack.connect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const credentials = args[1] as ChannelCredentials;
    const status = await bridges.slack!.connect(userId, credentials);
    return {
      success: true,
      data: status,
    };
  });

  gateway.registerMethod('carapace.slack.disconnect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    await bridges.slack!.disconnect(userId);
    return {
      success: true,
    };
  });

  gateway.registerMethod('carapace.slack.status', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const status = await bridges.slack!.status(userId);
    return {
      success: true,
      data: status,
    };
  });

  // WhatsApp channel methods
  gateway.registerMethod('carapace.whatsapp.qr.start', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const session = await bridges.whatsapp!.qrStart(userId);
    return {
      success: true,
      data: session,
    };
  });

  gateway.registerMethod('carapace.whatsapp.qr.wait', async (...args: unknown[]) => {
    const sessionId = args[0] as string;
    const timeoutMs = args[1] as number | undefined;
    const result = await bridges.whatsapp!.qrWait(sessionId, timeoutMs);
    return {
      success: true,
      data: {
        connected: result,
      },
    };
  });

  gateway.registerMethod('carapace.whatsapp.disconnect', async (...args: unknown[]) => {
    const userId = args[0] as string;
    await bridges.whatsapp!.disconnect(userId);
    return {
      success: true,
    };
  });

  gateway.registerMethod('carapace.whatsapp.status', async (...args: unknown[]) => {
    const userId = args[0] as string;
    const status = await bridges.whatsapp!.status(userId);
    return {
      success: true,
      data: status,
    };
  });
}

// Export bridge classes and types for external use
export { TelegramBridge, DiscordBridge, SlackBridge, WhatsAppBridgeImpl };
export type { ChannelStatus, ChannelCredentials, QRSession, StorageAdapter, EncryptionAdapter } from './src/types.js';
