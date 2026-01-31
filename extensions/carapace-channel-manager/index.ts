/**
 * Multi-tenant channel manager utility for Carapace
 * Handles fetching credentials and managing per-user channel clients
 */

export interface ChannelCredentials {
  userId: string
  channel: string
  platformUserId?: string
  credentials: Record<string, unknown>
  connectedAt: string
  subscriptionTier?: 'free' | 'unlimited'
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing'
  trialEndsAt?: string
}

export interface ChannelClient<T = unknown> {
  userId: string
  platformUserId?: string
  client: T
  connectedAt: Date
  subscriptionTier?: 'free' | 'unlimited'
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing'
  trialEndsAt?: string
}

interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
}

/**
 * Fetch channel credentials from S3
 */
export async function fetchChannelCredentials(
  userId: string,
  channel: string
): Promise<ChannelCredentials | null> {
  try {
    // Import userData service from @carapace/shared
    const { userData } = await import('@carapace/shared')

    const token = await userData.getChannelToken(userId, channel)
    if (!token) {
      return null
    }

    // Also fetch user profile for subscription info
    const profile = await userData.getProfile(userId)

    return {
      userId,
      channel,
      platformUserId: token.platformUserId,
      credentials: token.credentials as Record<string, unknown>,
      connectedAt: token.connectedAt,
      subscriptionTier: profile?.subscriptionTier,
      subscriptionStatus: profile?.subscriptionStatus,
      trialEndsAt: profile?.trialEndsAt,
    }
  } catch (error) {
    console.error(`Failed to fetch credentials for ${channel}/${userId}:`, error)
    return null
  }
}

/**
 * Generic client manager for multi-tenant channels
 */
export class ChannelClientManager<T = unknown> {
  private clients: Map<string, ChannelClient<T>> = new Map()
  private readonly channelName: string
  private readonly logger: Logger

  constructor(channelName: string, logger: Logger) {
    this.channelName = channelName
    this.logger = logger
  }

  /**
   * Initialize a client for a user
   */
  async initializeClient(
    userId: string,
    initFn: (credentials: ChannelCredentials) => Promise<T>
  ): Promise<ChannelClient<T> | null> {
    try {
      // Check if already initialized
      if (this.clients.has(userId)) {
        this.logger.info(`${this.channelName} client already initialized for user ${userId}`)
        return this.clients.get(userId)!
      }

      // Fetch credentials
      const credentials = await fetchChannelCredentials(userId, this.channelName)
      if (!credentials) {
        this.logger.warn(`No credentials found for ${this.channelName}/${userId}`)
        return null
      }

      // Initialize client using provided function
      this.logger.info(`Initializing ${this.channelName} client for user ${userId}`)
      const client = await initFn(credentials)

      // Store in memory with subscription info
      const channelClient: ChannelClient<T> = {
        userId,
        platformUserId: credentials.platformUserId,
        client,
        connectedAt: new Date(credentials.connectedAt),
        subscriptionTier: credentials.subscriptionTier,
        subscriptionStatus: credentials.subscriptionStatus,
        trialEndsAt: credentials.trialEndsAt,
      }

      this.clients.set(userId, channelClient)
      this.logger.info(`${this.channelName} client initialized for user ${userId}`)

      return channelClient
    } catch (error) {
      this.logger.error(`Failed to initialize ${this.channelName} client for ${userId}:`, error)
      return null
    }
  }

  /**
   * Get active client for a user
   */
  getClient(userId: string): ChannelClient<T> | null {
    return this.clients.get(userId) || null
  }

  /**
   * Remove client for a user
   */
  async removeClient(userId: string, cleanupFn?: (client: T) => Promise<void>): Promise<void> {
    const channelClient = this.clients.get(userId)
    if (!channelClient) {
      return
    }

    // Run cleanup if provided
    if (cleanupFn) {
      try {
        await cleanupFn(channelClient.client)
      } catch (error) {
        this.logger.error(`Error during ${this.channelName} client cleanup for ${userId}:`, error)
      }
    }

    this.clients.delete(userId)
    this.logger.info(`${this.channelName} client removed for user ${userId}`)
  }

  /**
   * Get all active clients
   */
  getAllClients(): ChannelClient<T>[] {
    return Array.from(this.clients.values())
  }

  /**
   * Find user by platform user ID
   */
  findUserByPlatformId(platformUserId: string): string | null {
    for (const [userId, client] of this.clients.entries()) {
      if (client.platformUserId === platformUserId) {
        return userId
      }
    }
    return null
  }

  /**
   * Check if a user has active subscription access
   */
  checkSubscriptionAccess(userId: string): {
    hasAccess: boolean
    reason: 'active_subscription' | 'trial_active' | 'trial_expired' | 'no_subscription'
    trialDaysRemaining?: number
    upgradeUrl: string
  } {
    const client = this.clients.get(userId)
    const upgradeUrl = 'https://carapace.ai/pricing'

    if (!client) {
      return {
        hasAccess: false,
        reason: 'no_subscription',
        upgradeUrl,
      }
    }

    // Active paid subscription
    if (client.subscriptionTier === 'unlimited' && client.subscriptionStatus === 'active') {
      return {
        hasAccess: true,
        reason: 'active_subscription',
        upgradeUrl,
      }
    }

    // Check trial status
    if (client.subscriptionStatus === 'trialing' && client.trialEndsAt) {
      const trialEnd = new Date(client.trialEndsAt)
      const now = new Date()
      const trialDaysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (trialDaysRemaining > 0) {
        return {
          hasAccess: true,
          reason: 'trial_active',
          trialDaysRemaining,
          upgradeUrl,
        }
      }

      // Trial has expired
      return {
        hasAccess: false,
        reason: 'trial_expired',
        trialDaysRemaining: 0,
        upgradeUrl,
      }
    }

    // No active subscription or trial
    return {
      hasAccess: false,
      reason: 'no_subscription',
      upgradeUrl,
    }
  }
}

export default {
  fetchChannelCredentials,
  ChannelClientManager,
}
