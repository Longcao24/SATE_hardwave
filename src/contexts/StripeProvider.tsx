import React, { createContext, useContext, useRef, useState, useEffect, type ReactNode } from 'react';
import {
  getCurrentSubscription,
  isLiveSubscriptionStatus,
  type SubscriptionTier,
  SUBSCRIPTION_TIERS
} from '@/services/stripeService';
import { useAuth } from './AuthProvider';

interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  tier_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

interface StripeContextType {
  subscription: Subscription | null;
  isLoading: boolean;
  hasActiveSubscription: boolean;
  currentTier: SubscriptionTier | null;
  refreshSubscription: () => Promise<void>;
}

const StripeContext = createContext<StripeContextType | undefined>(undefined);

interface StripeProviderProps {
  children: ReactNode;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Identifies the newest refresh; an older fetch that resolves late must not
  // overwrite it, or a signed-out account's tier sticks to the new account.
  const refreshIdRef = useRef(0);

  const refreshSubscription = async () => {
    const refreshId = ++refreshIdRef.current;

    if (!user) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const currentSubscription = await getCurrentSubscription();
      if (refreshId !== refreshIdRef.current) return;
      setSubscription(currentSubscription);
    } catch (error) {
      if (refreshId !== refreshIdRef.current) return;
      console.error('Error refreshing subscription:', error);
      setSubscription(null);
    } finally {
      if (refreshId === refreshIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshSubscription();
  }, [user]);

  // Don't show any tier while loading to prevent flash of "Free"
  const currentTier = isLoading 
    ? null 
    : subscription
      ? tierOfSubscription(subscription)
      : SUBSCRIPTION_TIERS[0]; // Default to free tier only after loading

  const value: StripeContextType = {
    subscription,
    isLoading,
    hasActiveSubscription: subscription !== null && isLiveSubscriptionStatus(subscription.status),
    currentTier,
    refreshSubscription
  };

  return (
    <StripeContext.Provider value={value}>
      {children}
    </StripeContext.Provider>
  );
};

// The webhook writes tier_id 'pro' for BOTH SATE Plan prices (that is what the database counts as
// premium), so a yearly plan is told apart by its billing period. It keeps id 'pro' — every feature
// gate, badge and guard keys on that id — and only takes the Yearly card's name, price and plan.
// Old 'enterprise' rows (all canceled today) still read as enterprise.
function tierOfSubscription(sub: { tier_id: string; current_period_start?: string | null; current_period_end?: string | null }) {
  const days = sub.current_period_start && sub.current_period_end
    ? (Date.parse(sub.current_period_end) - Date.parse(sub.current_period_start)) / 86400000
    : 0;
  if (sub.tier_id === 'pro' && days > 180) {
    const yearly = SUBSCRIPTION_TIERS.find(tier => tier.plan === 'yearly');
    if (yearly) return { ...yearly, id: 'pro' };
  }
  return SUBSCRIPTION_TIERS.find(tier => tier.id === sub.tier_id) || SUBSCRIPTION_TIERS[0];
}

export const useStripe = (): StripeContextType => {
  const context = useContext(StripeContext);
  if (context === undefined) {
    throw new Error('useStripe must be used within a StripeProvider');
  }
  return context;
};

