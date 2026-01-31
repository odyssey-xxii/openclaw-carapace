/**
 * Per-user channel settings manager for multi-tenant Mahdi
 */

export interface UserChannelSettings {
  userId: string
  platformUserId?: string
  groupPolicy: 'disabled' | 'open'
  connectedAt: Date
  subscriptionTier?: 'free' | 'unlimited'
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing'
  trialEndsAt?: string
}

export interface SubscriptionCheckResult {
  hasAccess: boolean
  reason: 'active_subscription' | 'trial_active' | 'trial_expired' | 'no_subscription'
  trialDaysRemaining?: number
  upgradeUrl: string
}

/**
 * Stores per-user channel settings in memory
 * This allows the shared bot to apply different policies per user
 */
export class UserSettingsManager {
  private settings: Map<string, UserChannelSettings> = new Map()
  private platformUserIdIndex: Map<string, string> = new Map()

  /**
   * Store settings for a user
   */
  setUserSettings(userId: string, settings: Omit<UserChannelSettings, 'userId'>): void {
    this.settings.set(userId, {
      userId,
      ...settings,
    })

    // Index by platformUserId for reverse lookup
    if (settings.platformUserId) {
      this.platformUserIdIndex.set(settings.platformUserId, userId)
    }
  }

  /**
   * Get settings for a user
   */
  getUserSettings(userId: string): UserChannelSettings | null {
    return this.settings.get(userId) || null
  }

  /**
   * Find Mahdi user ID by platform user ID
   */
  findUserIdByPlatformId(platformUserId: string): string | null {
    return this.platformUserIdIndex.get(platformUserId) || null
  }

  /**
   * Get groupPolicy for a user (defaults to 'disabled' for security)
   */
  getGroupPolicy(userId: string): 'disabled' | 'open' {
    const settings = this.settings.get(userId)
    return settings?.groupPolicy || 'disabled'
  }

  /**
   * Check if a platform user is authorized
   */
  isAuthorized(platformUserId: string): boolean {
    return this.platformUserIdIndex.has(platformUserId)
  }

  /**
   * Remove settings for a user
   */
  removeUserSettings(userId: string): void {
    const settings = this.settings.get(userId)
    if (settings?.platformUserId) {
      this.platformUserIdIndex.delete(settings.platformUserId)
    }
    this.settings.delete(userId)
  }

  /**
   * Get all connected users
   */
  getAllUsers(): string[] {
    return Array.from(this.settings.keys())
  }

  /**
   * Check if a user has active subscription access
   */
  checkSubscriptionAccess(userId: string): SubscriptionCheckResult {
    const settings = this.settings.get(userId)
    const upgradeUrl = 'https://mahdi.ai/pricing'

    if (!settings) {
      return {
        hasAccess: false,
        reason: 'no_subscription',
        upgradeUrl,
      }
    }

    // Active paid subscription
    if (settings.subscriptionTier === 'unlimited' && settings.subscriptionStatus === 'active') {
      return {
        hasAccess: true,
        reason: 'active_subscription',
        upgradeUrl,
      }
    }

    // Check trial status
    if (settings.subscriptionStatus === 'trialing' && settings.trialEndsAt) {
      const trialEnd = new Date(settings.trialEndsAt)
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
