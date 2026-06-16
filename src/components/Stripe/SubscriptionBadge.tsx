import React from 'react';
import { Crown, Zap, Sparkles } from 'lucide-react';
import { useStripe } from '@/contexts/StripeProvider';
import { useNavigate } from 'react-router-dom';

interface SubscriptionBadgeProps {
  variant?: 'compact' | 'detailed';
  showUpgrade?: boolean;
}

export const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ 
  variant = 'compact',
  showUpgrade = true 
}) => {
  const { currentTier, hasActiveSubscription, isLoading } = useStripe();
  const navigate = useNavigate();

  const getTierStyles = (tierId: string) => {
    switch (tierId) {
      case 'free':
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          border: 'border-gray-300',
          icon: Sparkles
        };
      case 'pro':
        return {
          bg: 'bg-gradient-to-r from-blue-100 to-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-300',
          icon: Zap
        };
      case 'enterprise':
        return {
          bg: 'bg-gradient-to-r from-purple-100 to-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-300',
          icon: Crown
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          border: 'border-gray-300',
          icon: Sparkles
        };
    }
  };

  // Show loading skeleton while fetching subscription
  if (isLoading || !currentTier) {
    if (variant === 'compact') {
      return (
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 animate-pulse">
          <div className="w-3.5 h-3.5 bg-gray-300 rounded-full"></div>
          <div className="w-16 h-3 bg-gray-300 rounded"></div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50 animate-pulse">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-300 rounded-lg"></div>
          <div>
            <div className="w-24 h-4 bg-gray-300 rounded mb-2"></div>
            <div className="w-16 h-3 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const styles = getTierStyles(currentTier.id);
  const Icon = styles.icon;

  if (variant === 'compact') {
    return (
      <div 
        onClick={() => navigate('/profile')}
        className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border ${styles.border} ${styles.bg} ${styles.text} font-medium text-xs cursor-pointer hover:opacity-80 transition-opacity`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{currentTier.name}</span>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center justify-between p-4 rounded-lg border ${styles.border} ${styles.bg} cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={() => navigate('/profile')}
    >
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${styles.bg}`}>
          <Icon className={`w-5 h-5 ${styles.text}`} />
        </div>
        <div>
          <p className={`font-semibold ${styles.text}`}>
            {currentTier.name} Plan
          </p>
          {hasActiveSubscription && currentTier.price && (
            <p className="text-xs text-gray-600">
              ${currentTier.price}/{currentTier.interval}
            </p>
          )}
          {!hasActiveSubscription && (
            <p className="text-xs text-gray-600">
              Limited features
            </p>
          )}
        </div>
      </div>
      {showUpgrade && !hasActiveSubscription && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            navigate('/pricing');
          }}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors"
        >
          Upgrade
        </button>
      )}
    </div>
  );
};

export default SubscriptionBadge;

