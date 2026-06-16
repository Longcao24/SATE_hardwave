import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStripe } from '@/contexts/StripeProvider';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface SubscriptionGuardProps {
  children: React.ReactNode;
  requiredTier?: 'free' | 'pro' | 'enterprise';
  fallbackMessage?: string;
}

/**
 * Component to guard content based on subscription tier
 * Usage:
 * <SubscriptionGuard requiredTier="pro">
 *   <PremiumFeature />
 * </SubscriptionGuard>
 */
export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  children,
  requiredTier = 'pro',
  fallbackMessage
}) => {
  const { currentTier, isLoading } = useStripe();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // Tier hierarchy
  const tierHierarchy = {
    free: 0,
    pro: 1,
    enterprise: 2
  };

  const currentTierLevel = tierHierarchy[currentTier?.id as keyof typeof tierHierarchy] || 0;
  const requiredTierLevel = tierHierarchy[requiredTier];

  // Check if user has access
  const hasAccess = currentTierLevel >= requiredTierLevel;

  if (!hasAccess) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Premium Feature
        </h3>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {fallbackMessage || `This feature requires the ${requiredTier} plan or higher.`}
        </p>

        <Button
          onClick={() => navigate('/pricing')}
          className="w-full"
        >
          View Plans
        </Button>
      </Card>
    );
  }

  return <>{children}</>;
};

/**
 * Hook to check subscription access
 * Usage:
 * const { hasAccess, currentTier } = useSubscriptionAccess('pro');
 */
export const useSubscriptionAccess = (requiredTier: 'free' | 'pro' | 'enterprise' = 'pro') => {
  const { currentTier, hasActiveSubscription, isLoading } = useStripe();

  const tierHierarchy = {
    free: 0,
    pro: 1,
    enterprise: 2
  };

  const currentTierLevel = tierHierarchy[currentTier?.id as keyof typeof tierHierarchy] || 0;
  const requiredTierLevel = tierHierarchy[requiredTier];

  return {
    hasAccess: currentTierLevel >= requiredTierLevel,
    currentTier,
    hasActiveSubscription,
    isLoading
  };
};

