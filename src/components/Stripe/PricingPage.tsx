import React, { useState } from 'react';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { SUBSCRIPTION_TIERS, changeSubscriptionPlan, redirectToCheckout } from '@/services/stripeService';
import { useStripe } from '@/contexts/StripeProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useNavigate } from 'react-router-dom';

export const PricingPage: React.FC = () => {
  const { user } = useAuth();
  const { currentTier, hasActiveSubscription } = useStripe();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleSubscribe = async (tierId: string, stripePriceId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!stripePriceId) {
      return; // Free tier, no action needed
    }

    setLoadingTier(tierId);
    try {
      // If user has an active subscription, use the plan change function
      // which will automatically cancel the old one
      if (hasActiveSubscription) {
        const result = await changeSubscriptionPlan(stripePriceId);
        if (result) {
          window.location.href = result.url;
        }
      } else {
        // First time subscription
        await redirectToCheckout({
          priceId: stripePriceId,
          mode: 'subscription',
          metadata: {
            tier_id: tierId
          }
        });
      }
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      alert('Failed to start checkout process. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  };

  const isCurrentTier = (tierId: string) => {
    return currentTier?.id === tierId;
  };

  const getPlanType = (tierId: string): 'free' | 'plus' | 'pro' => {
    if (tierId === 'free') return 'free';
    if (tierId === 'pro') return 'plus';
    return 'pro'; // enterprise mapped to pro
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">SATE</h1>
          <div className="w-32" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Page Title */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold text-gray-900 mb-8">
            Unlock advanced features
          </h2>
          
          {/* Plan Type Toggle */}
          <div className="inline-flex items-center bg-gray-100 rounded-full p-1 mb-8">
            <button className="px-6 py-2 rounded-full text-sm font-medium bg-white text-gray-900 shadow-sm">
              Personal
            </button>
            <button className="px-6 py-2 rounded-full text-sm font-medium text-gray-600 hover:text-gray-900">
              Business
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const isCurrent = isCurrentTier(tier.id);
            const planType = getPlanType(tier.id);
            const loading = loadingTier === tier.id;
            const isPlus = planType === 'plus';
            const isPro = planType === 'pro';

            return (
              <div
                key={tier.id}
                className={`relative bg-white border-2 rounded-2xl p-6 transition-all ${
                  isPlus
                    ? 'border-green-600 bg-green-50/30'
                    : 'border-gray-200'
                }`}
              >
                {/* Tier Name */}
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                  {tier.name}
                </h3>

                {/* Price */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-gray-600">$</span>
                    <span className="text-5xl font-medium text-gray-900">
                      {tier.price}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-sm text-gray-600 ml-1">
                        USD / {tier.interval}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-gray-700 text-sm mb-6 min-h-[40px]">
                  {tier.id === 'free' 
                    ? 'Explore how AI can help you with everyday tasks'
                    : tier.id === 'pro'
                    ? 'Level up productivity and creativity with expanded access'
                    : 'Get the best of SATE with the highest level of access'
                  }
                </p>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(tier.id, tier.stripePriceId)}
                  disabled={loading || isCurrent || (tier.id === 'free' && hasActiveSubscription)}
                  className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all mb-6 ${
                    isCurrent
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : isPlus
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : isPro
                      ? 'bg-black hover:bg-gray-800 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </span>
                  ) : isCurrent ? (
                    'Your current plan'
                  ) : (
                    `Get ${tier.name}`
                  )}
                </button>

                {/* Features */}
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-sm">
                      <Check className="w-5 h-5 text-gray-900 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
            Frequently Asked Questions
          </h3>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Can I change plans later?</h4>
              <p className="text-sm text-gray-600">
                Yes! You can upgrade or downgrade anytime. When you change plans, your old subscription is automatically canceled and replaced with the new one. You'll only ever have one active subscription.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">What payment methods do you accept?</h4>
              <p className="text-sm text-gray-600">
                We accept all major credit cards, debit cards, and support recurring billing.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Can I cancel anytime?</h4>
              <p className="text-sm text-gray-600">
                Absolutely. Cancel anytime from your billing settings with no penalties or fees.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Need help choosing?</h4>
              <p className="text-sm text-gray-600">
                Contact us at <a href="mailto:support@sate.com" className="text-blue-600 hover:text-blue-700 font-medium">support@sate.com</a> and we'll help you find the perfect plan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

