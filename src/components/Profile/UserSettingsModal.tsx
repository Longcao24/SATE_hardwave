import React, { useState, useEffect as UseEffect } from 'react';
import { 
  User, 
  CreditCard, 
  ChevronRight, 
  Bell,
  Lock,
  Zap,
  X,
  Wallet,
  Ticket,
  Copy,
  Check,
  Plus,
  Clock,
  Users,
  Trash2,
  Type,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { useStripe } from '@/contexts/StripeProvider';
import { useAccessibility, type TextSize } from '@/contexts/AccessibilityProvider';
import { SUBSCRIPTION_TIERS } from '@/services/stripeService';
import { useNavigate } from 'react-router-dom';
import {
  generateInviteCode,
  getMyInviteCodes,
  deactivateInviteCode,
  type InviteCode,
} from '@/services/inviteCodeService';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'profile' | 'subscription' | 'billing' | 'security' | 'notifications' | 'inviteCodes' | 'accessibility';
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({ isOpen, onClose, initialSection = 'profile' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, currentTier, isLoading } = useStripe();
  const { textSize, setTextSize, resetToDefault } = useAccessibility();
  const [activeSection, setActiveSection] = useState<'profile' | 'subscription' | 'billing' | 'security' | 'notifications' | 'inviteCodes' | 'accessibility'>(initialSection);
  
  // Invite Codes state
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Update active section when initialSection changes
  React.useEffect(() => {
    if (isOpen) {
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  // Load invite codes when modal opens and inviteCodes section is active
  UseEffect(() => {
    if (isOpen && activeSection === 'inviteCodes') {
      loadInviteCodes();
    }
  }, [isOpen, activeSection]);

  const loadInviteCodes = async () => {
    setLoadingCodes(true);
    setInviteError(null);
    const { data, error } = await getMyInviteCodes();
    if (error) {
      setInviteError('Failed to load invite codes');
      console.error(error);
    } else {
      setInviteCodes(data || []);
    }
    setLoadingCodes(false);
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    setInviteError(null);
    const { data, error } = await generateInviteCode(maxUses, expiresInDays);
    if (error) {
      setInviteError('Failed to generate invite code');
      console.error(error);
    } else if (data) {
      setInviteCodes([data, ...inviteCodes]);
      setShowCreateForm(false);
      setMaxUses(1);
      setExpiresInDays(undefined);
    }
    setGenerating(false);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleDeactivateCode = async (codeId: string) => {
    if (!confirm('Are you sure you want to deactivate this invite code?')) {
      return;
    }

    const { success, error } = await deactivateInviteCode(codeId);
    if (error) {
      setInviteError('Failed to deactivate invite code');
      console.error(error);
    } else if (success) {
      await loadInviteCodes();
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isMaxedOut = (code: InviteCode) => {
    return code.current_uses >= code.max_uses;
  };

  const getStatusColor = (code: InviteCode) => {
    if (!code.is_active) return 'bg-gray-100 text-gray-600';
    if (isExpired(code.expires_at)) return 'bg-red-100 text-red-600';
    if (isMaxedOut(code)) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  const getStatusText = (code: InviteCode) => {
    if (!code.is_active) return 'Inactive';
    if (isExpired(code.expires_at)) return 'Expired';
    if (isMaxedOut(code)) return 'Max Uses Reached';
    return 'Active';
  };

  // Handle ESC key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
            <p className="text-sm text-gray-600">Manage your account and preferences</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-64 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection('profile')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'profile'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5" />
                  <span>Account</span>
                </div>
                {activeSection === 'profile' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('notifications')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'notifications'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5" />
                  <span>Notifications</span>
                </div>
                {activeSection === 'notifications' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('subscription')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'subscription'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5" />
                  <span>Subscription</span>
                </div>
                {activeSection === 'subscription' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('billing')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'billing'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5" />
                  <span>Billing</span>
                </div>
                {activeSection === 'billing' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('inviteCodes')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'inviteCodes'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Ticket className="w-5 h-5" />
                  <span>Invite Codes</span>
                </div>
                {activeSection === 'inviteCodes' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('accessibility')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'accessibility'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5" />
                  <span>Accessibility</span>
                </div>
                {activeSection === 'accessibility' && <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setActiveSection('security')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'security'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-white/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5" />
                  <span>Security</span>
                </div>
                {activeSection === 'security' && <ChevronRight className="w-4 h-4" />}
              </button>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Account</h3>
                  <p className="text-gray-600">Manage your account information</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h4>

                  <div className="space-y-4">
                    <div className="flex items-start justify-between py-4 border-b border-gray-200">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <p className="text-base text-gray-900 font-medium">{user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-start justify-between py-4 border-b border-gray-200">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Member Since</p>
                        <p className="text-base text-gray-900 font-medium">
                          {user?.created_at ? formatDate(user.created_at) : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start justify-between py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Account Status</p>
                        <p className="text-base text-green-600 font-semibold">Active</p>
                      </div>
                    </div>

                    {/* Current Plan Badge */}
                    <div className="flex items-start justify-between py-4 border-t border-gray-200">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Current Plan</p>
                        {isLoading || !currentTier ? (
                          <div className="w-20 h-5 bg-gray-200 rounded animate-pulse mt-1"></div>
                        ) : (
                          <div className={`inline-flex items-center px-3 py-1.5 rounded-lg ${getTierBadgeColor(currentTier.id)} font-semibold text-sm mt-1`}>
                            <span>{currentTier.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Notifications</h3>
                  <p className="text-gray-600">Manage your notification preferences</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h4>
                  <p className="text-sm text-gray-600 mb-6">
                    Choose what updates you'd like to receive
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-gray-900">Product Updates</p>
                        <p className="text-sm text-gray-600">News about product features and updates</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between py-3 border-t border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Security Alerts</p>
                        <p className="text-sm text-gray-600">Important notifications about your account</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between py-3 border-t border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900">Marketing Emails</p>
                        <p className="text-sm text-gray-600">Tips, guides, and promotional content</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Subscription Section */}
            {activeSection === 'subscription' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Subscription</h3>
                  <p className="text-gray-600">Manage your subscription and billing</p>
                </div>

                {/* Current Subscription Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h4>

                  {isLoading || !currentTier ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : (
                    <div>
                      <div className="bg-blue-50 rounded-lg p-5 mb-5">
                        <h4 className="text-xl font-bold text-gray-900 mb-1">
                          {currentTier.name} Plan
                        </h4>
                        <p className="text-gray-700 text-sm">
                          {currentTier.id === 'free' ? (
                            'Free forever'
                          ) : (
                            <>
                              ${currentTier.price}/{currentTier.interval}
                              {subscription && (
                                <span className="ml-2">
                                  • Renews {formatDate(subscription.current_period_end)}
                                </span>
                              )}
                            </>
                          )}
                        </p>
                      </div>

                      {/* Features */}
                      <div className="mb-5">
                        <h4 className="font-semibold text-gray-900 mb-3">
                          Your Plan Includes:
                        </h4>
                        <ul className="space-y-2">
                          {currentTier.features.map((feature, index) => (
                            <li key={index} className="flex items-start text-gray-700">
                              <Zap className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Actions */}
                      <div className="pt-4 border-t border-gray-200">
                        {currentTier.id === 'free' ? (
                          <Button
                            onClick={() => handleNavigate('/pricing')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Upgrade to Pro
                          </Button>
                        ) : (
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleNavigate('/settings/billing')}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Manage Billing
                            </Button>
                            <Button
                              onClick={() => handleNavigate('/pricing')}
                              className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Change Plan
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Available Plans */}
                {!isLoading && currentTier && currentTier.id === 'free' && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">
                      Upgrade for More Features
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      {SUBSCRIPTION_TIERS.filter(tier => tier.id !== 'free').map((tier) => (
                        <div
                          key={tier.id}
                          className="border border-gray-200 rounded-lg p-5 hover:border-blue-400 transition-colors cursor-pointer"
                          onClick={() => handleNavigate('/pricing')}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h5 className="font-semibold text-gray-900">{tier.name}</h5>
                            <span className="text-2xl font-bold text-blue-600">${tier.price}</span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {tier.features[0]}
                          </p>
                          <div className="mt-3 text-blue-600 text-sm font-medium">
                            View Details
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Billing Section */}
            {activeSection === 'billing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Billing</h3>
                  <p className="text-gray-600">Manage your billing and payment methods</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Payment Method</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-4 border-b border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900">Credit Card</p>
                        <p className="text-sm text-gray-600">No payment method added</p>
                      </div>
                      <Button className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
                        Add Card
                      </Button>
                    </div>

                    <div className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium text-gray-900">Billing Portal</p>
                        <p className="text-sm text-gray-600">Manage invoices and payment history</p>
                      </div>
                      <Button 
                        onClick={() => handleNavigate('/settings/billing')}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Open Portal
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Accessibility Section */}
            {activeSection === 'accessibility' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Accessibility</h3>
                  <p className="text-gray-600">Customize your viewing experience</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center mb-4">
                    <Type className="w-5 h-5 text-blue-600 mr-3" />
                    <h4 className="text-lg font-semibold text-gray-900">Text Size</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-6">
                    Choose a comfortable text size for better readability. This will affect all text throughout the application.
                  </p>

                  {/* Text Size Options */}
                  <div className="space-y-3 mb-6">
                    {[
                      { value: 'small' as TextSize, label: 'Small', description: 'Compact text for more content' },
                      { value: 'medium' as TextSize, label: 'Medium', description: 'Default text size (recommended)' },
                      { value: 'large' as TextSize, label: 'Large', description: 'Larger text for better readability' },
                      { value: 'extra-large' as TextSize, label: 'Extra Large', description: 'Maximum text size' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setTextSize(option.value)}
                        className={`w-full flex items-center justify-between p-4 border-2 rounded-lg transition-all ${
                          textSize === option.value
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{option.label}</p>
                            {textSize === option.value && (
                              <Check className="w-4 h-4 text-blue-600" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                        </div>
                        <div className={`w-16 h-16 flex items-center justify-center rounded-lg ${
                          textSize === option.value ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <Type className={`${
                            option.value === 'small' ? 'w-4 h-4' :
                            option.value === 'medium' ? 'w-5 h-5' :
                            option.value === 'large' ? 'w-6 h-6' :
                            'w-7 h-7'
                          } ${textSize === option.value ? 'text-blue-600' : 'text-gray-600'}`} />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Preview */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                    <p className="text-base text-gray-900 mb-2">
                      The quick brown fox jumps over the lazy dog.
                    </p>
                    <p className="text-sm text-gray-600">
                      This is how text will appear throughout the application.
                    </p>
                  </div>

                  {/* Reset Button */}
                  <Button
                    onClick={resetToDefault}
                    variant="outline"
                    className="w-full"
                  >
                    Reset to Default
                  </Button>
                </div>

                {/* Additional Accessibility Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Eye className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Accessibility Tip</h4>
                      <p className="text-sm text-gray-700">
                        Your text size preference is saved automatically and will be applied across all pages of the application. 
                        You can change it anytime from this settings page.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security Section */}
            {activeSection === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">Security</h3>
                  <p className="text-gray-600">Manage your account security settings</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h4>
                  
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

                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-red-900 mb-2">
                    Danger Zone
                  </h4>
                  <p className="text-sm text-red-700 mb-4">
                    Permanently delete your account and all associated data
                  </p>
                  <Button className="bg-white border-2 border-red-600 text-red-600 hover:bg-red-50">
                    Delete Account
                  </Button>
                </div>
              </div>
            )}

            {/* Invite Codes Section */}
            {activeSection === 'inviteCodes' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">Invite Codes</h3>
                    <p className="text-gray-600">Generate and manage invite codes for new users</p>
                  </div>
                  <Button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Generate Code
                  </Button>
                </div>

                {/* Error Message */}
                {inviteError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-600">{inviteError}</p>
                  </div>
                )}

                {/* Create Form */}
                {showCreateForm && (
                  <div className="bg-gray-50 rounded-lg p-6 border-2 border-blue-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Generate New Invite Code</h3>
                      <button
                        onClick={() => setShowCreateForm(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Maximum Uses
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={maxUses}
                          onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="How many times can this code be used?"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expires In (Days) - Optional
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={expiresInDays || ''}
                          onChange={(e) =>
                            setExpiresInDays(e.target.value ? parseInt(e.target.value) : undefined)
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Leave empty for no expiration"
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={handleGenerateCode}
                          disabled={generating}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {generating ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Generating...
                            </>
                          ) : (
                            'Generate Code'
                          )}
                        </Button>
                        <Button
                          onClick={() => setShowCreateForm(false)}
                          variant="outline"
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invite Codes List */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Your Invite Codes</h4>

                  {loadingCodes ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : inviteCodes.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500">No invite codes yet. Generate one to get started!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {inviteCodes.map((code) => (
                        <div
                          key={code.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <code className="text-lg font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
                                  {code.code}
                                </code>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                    code
                                  )}`}
                                >
                                  {getStatusText(code)}
                                </span>
                              </div>

                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Users className="w-4 h-4" />
                                  <span>
                                    {code.current_uses} / {code.max_uses} uses
                                  </span>
                                </div>
                                {code.expires_at && (
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    <span>
                                      Expires: {new Date(code.expires_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span>Created: {new Date(code.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleCopyCode(code.code)}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-2"
                              >
                                {copiedCode === code.code ? (
                                  <>
                                    <Check className="w-4 h-4 text-green-600" />
                                    <span className="text-green-600">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              {code.is_active && (
                                <Button
                                  onClick={() => handleDeactivateCode(code.id)}
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

