import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  CreditCard, 
  Crown, 
  Settings, 
  ChevronRight, 
  Mail, 
  Calendar,
  Shield,
  Bell,
  Lock,
  Zap,
  ExternalLink,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useStripe } from '@/contexts/StripeProvider';
import { SUBSCRIPTION_TIERS } from '@/services/stripeService';

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, currentTier, hasActiveSubscription, isLoading } = useStripe();
  const [activeSection, setActiveSection] = useState<'profile' | 'subscription' | 'security'>('profile');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTierIcon = (tierId: string) => {
    switch (tierId) {
      case 'pro':
        return <Zap className="w-4 h-4" />;
      case 'enterprise':
        return <Crown className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  const getTierBadgeColor = (tierId: string) => {
    switch (tierId) {
      case 'free':
        return 'bg-gray-100 text-gray-600';
      case 'pro':
        return 'bg-blue-100 text-blue-600';
      case 'enterprise':
        return 'bg-purple-100 text-purple-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
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
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Page Title & Badge */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Profile & Settings
            </h2>
            <p className="text-gray-600">
              Manage your account and subscription
            </p>
          </div>
          {/* Loading skeleton or actual badge */}
          {isLoading || !currentTier ? (
            <div className="px-4 py-2 rounded-lg bg-gray-100 flex items-center space-x-2 animate-pulse">
              <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
              <div className="w-20 h-4 bg-gray-300 rounded"></div>
            </div>
          ) : (
            <div className={`px-4 py-2 rounded-lg ${getTierBadgeColor(currentTier.id)} font-semibold flex items-center space-x-2`}>
              {getTierIcon(currentTier.id)}
              <span>{currentTier.name} Plan</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveSection('profile')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === 'profile'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setActiveSection('subscription')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === 'subscription'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <CreditCard className="w-4 h-4" />
                    <span>Subscription</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setActiveSection('security')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === 'security'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Lock className="w-4 h-4" />
                    <span>Security</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </nav>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <Button
                  onClick={() => navigate('/settings/billing')}
                  className="w-full bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Billing Settings
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-8">
                  <div className="flex items-center mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg mr-3">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Account Information
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start justify-between py-4 border-b border-gray-200">
                      <div className="flex items-center space-x-3">
                        <Mail className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">Email</p>
                          <p className="text-base text-gray-900 font-medium">{user?.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between py-4 border-b border-gray-200">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">Member Since</p>
                          <p className="text-base text-gray-900 font-medium">
                            {user?.created_at ? formatDate(user.created_at) : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between py-4">
                      <div className="flex items-center space-x-3">
                        <Shield className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">Account Status</p>
                          <p className="text-base text-green-600 font-semibold">Active</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notifications Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-8">
                  <div className="flex items-center mb-4">
                    <div className="p-2 bg-blue-100 rounded-lg mr-3">
                      <Bell className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Notification Preferences
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-6">
                    Manage your email and notification preferences
                  </p>
                  <Button className="bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50">
                    Configure Notifications
                  </Button>
                </div>
              </div>
            )}

            {/* Subscription Section */}
            {activeSection === 'subscription' && (
              <div className="space-y-6">
                {/* Current Subscription Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <Crown className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Current Subscription
                      </h3>
                    </div>
                    {hasActiveSubscription && (
                      <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
                        Active
                      </span>
                    )}
                  </div>

                  {isLoading || !currentTier ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : (
                    <div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 mb-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-2xl font-bold text-gray-900">
                              {currentTier.name} Plan
                            </h4>
                            <p className="text-gray-700 mt-1">
                              {currentTier.id === 'free' ? (
                                'Free forever'
                              ) : (
                                <>
                                  ${currentTier.price}/{currentTier.interval}
                                  {subscription && (
                                    <span className="ml-2 text-sm">
                                      • Renews {formatDate(subscription.current_period_end)}
                                    </span>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                          {currentTier.id !== 'free' && (
                            <div className="text-right">
                              <div className="text-3xl font-bold text-blue-600">
                                ${currentTier.price}
                              </div>
                              <div className="text-sm text-gray-600">per month</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mb-6">
                        <h4 className="font-semibold text-gray-900 mb-3">
                          Your Plan Includes:
                        </h4>
                        <ul className="space-y-2">
                          {currentTier.features.map((feature, index) => (
                            <li key={index} className="flex items-start">
                              <Zap className="w-4 h-4 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-3 pt-4 border-t border-gray-200">
                        {currentTier.id === 'free' ? (
                          <Button
                            onClick={() => navigate('/pricing')}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Crown className="w-4 h-4 mr-2" />
                            Upgrade to Pro
                          </Button>
                        ) : (
                          <>
                            <Button
                              onClick={() => navigate('/settings/billing')}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Manage Billing
                            </Button>
                            <Button
                              onClick={() => navigate('/pricing')}
                              className="flex-1 bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50"
                            >
                              Change Plan
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Available Plans */}
                {!isLoading && currentTier && currentTier.id === 'free' && (
                  <div className="bg-white border border-gray-200 rounded-lg p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Upgrade for More Features
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {SUBSCRIPTION_TIERS.filter(tier => tier.id !== 'free').map((tier) => (
                        <div
                          key={tier.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
                          onClick={() => navigate('/pricing')}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-gray-900">{tier.name}</h4>
                            <span className="text-2xl font-bold text-blue-600">${tier.price}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">
                            {tier.features[0]}
                          </p>
                          <div className="flex items-center text-blue-600 text-sm font-medium">
                            View Details
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Security Section */}
            {activeSection === 'security' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-8">
                  <div className="flex items-center mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg mr-3">
                      <Lock className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Security Settings
                    </h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-4 border-b border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900">Password</p>
                        <p className="text-sm text-gray-600">Last changed 30 days ago</p>
                      </div>
                      <Button className="bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50">
                        Change Password
                      </Button>
                    </div>

                    <div className="flex items-center justify-between py-4 border-b border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                        <p className="text-sm text-gray-600">Add an extra layer of security</p>
                      </div>
                      <Button className="bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50">
                        Enable 2FA
                      </Button>
                    </div>

                    <div className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium text-gray-900">Active Sessions</p>
                        <p className="text-sm text-gray-600">Manage your active sessions</p>
                      </div>
                      <Button className="bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50">
                        View Sessions
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-8">
                  <h3 className="text-lg font-semibold text-red-900 mb-2">
                    Danger Zone
                  </h3>
                  <p className="text-sm text-red-700 mb-4">
                    Permanently delete your account and all associated data
                  </p>
                  <Button className="bg-white border-2 border-red-600 text-red-600 hover:bg-red-50">
                    Delete Account
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

