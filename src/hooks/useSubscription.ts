import { useStripe } from '@/contexts/StripeProvider';

/**
 * Custom hook to check if feature is available based on subscription tier
 */
export const useSubscription = () => {
  const { currentTier, hasActiveSubscription, isLoading, subscription } = useStripe();

  const features = {
    // Free tier features
    basicTranscription: true,
    recordingsPerMonth: currentTier?.id === 'free' ? 10 : Infinity,

    // Pro tier features
    unlimitedRecordings: currentTier?.id === 'pro' || currentTier?.id === 'enterprise',
    advancedTranscription: currentTier?.id === 'pro' || currentTier?.id === 'enterprise',
    speakerDiarization: currentTier?.id === 'pro' || currentTier?.id === 'enterprise',
    exportReports: currentTier?.id === 'pro' || currentTier?.id === 'enterprise',
    prioritySupport: currentTier?.id === 'pro' || currentTier?.id === 'enterprise',

    // Enterprise tier features
    customIntegrations: currentTier?.id === 'enterprise',
    dedicatedSupport: currentTier?.id === 'enterprise',
    advancedAnalytics: currentTier?.id === 'enterprise',
    teamCollaboration: currentTier?.id === 'enterprise',
    ssoSaml: currentTier?.id === 'enterprise',
  };

  const canAccessFeature = (featureName: keyof typeof features): boolean => {
    return features[featureName] === true;
  };

  const getRemainingRecordings = async (currentUsage: number): Promise<number> => {
    if (features.unlimitedRecordings) {
      return Infinity;
    }
    return Math.max(0, features.recordingsPerMonth - currentUsage);
  };

  return {
    currentTier,
    hasActiveSubscription,
    isLoading,
    subscription,
    features,
    canAccessFeature,
    getRemainingRecordings,
  };
};




