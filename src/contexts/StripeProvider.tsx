import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  getCurrentSubscription,
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

  const refreshSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const currentSubscription = await getCurrentSubscription();
      setSubscription(currentSubscription);
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSubscription();
  }, [user]);

  // Don't show any tier while loading to prevent flash of "Free"
  const currentTier = isLoading 
    ? null 
    : subscription
      ? SUBSCRIPTION_TIERS.find(tier => tier.id === subscription.tier_id) || SUBSCRIPTION_TIERS[0]
      : SUBSCRIPTION_TIERS[0]; // Default to free tier only after loading

  const value: StripeContextType = {
    subscription,
    isLoading,
    hasActiveSubscription: subscription !== null && subscription.status === 'active',
    currentTier,
    refreshSubscription
  };

  return (
    <StripeContext.Provider value={value}>
      {children}
    </StripeContext.Provider>
  );
};

export const useStripe = (): StripeContextType => {
  const context = useContext(StripeContext);
  if (context === undefined) {
    throw new Error('useStripe must be used within a StripeProvider');
  }
  return context;
};

