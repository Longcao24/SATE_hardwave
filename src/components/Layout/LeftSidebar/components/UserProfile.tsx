import React from 'react';
import { User, Crown, CreditCard, Settings, Ticket, LogOut } from 'lucide-react';
import { MobileLinkButton } from '../../../Auth/MobileLinkModal';

interface UserProfileProps {
  user: { email?: string } | null;
  currentTier: { name?: string; id?: string } | null;
  subscriptionLoading: boolean;
  showUserProfile: boolean;
  onToggleProfile: () => void;
  onSettingsClick: (section: 'profile' | 'billing' | 'inviteCodes') => void;
  onUpgradeClick: () => void;
  onLogout: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  currentTier,
  subscriptionLoading,
  showUserProfile,
  onToggleProfile,
  onSettingsClick,
  onUpgradeClick,
  onLogout
}) => {
  if (!user) return null;

  return (
    <div className="px-6 pb-4 flex-shrink-0">
      <div className="relative" data-profile-dropdown>
        <br />
        <div className="w-full flex items-center gap-3 p-3 rounded-lg bg-white">
          <button
            onClick={onToggleProfile}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-white">
                {user.email?.split('@')[0].substring(0, 2).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-600 truncate">
                {subscriptionLoading ? 'Loading...' : (currentTier?.name || 'Free')}
              </p>
            </div>
          </button>
          {!subscriptionLoading && (currentTier?.id === 'free' || !currentTier) && (
            <button
              onClick={onUpgradeClick}
              className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-md transition-all shadow-sm hover:shadow-md flex items-center gap-1 whitespace-nowrap flex-shrink-0"
            >
              Upgrade
            </button>
          )}
        </div>
        
        {/* User Profile Dropdown */}
        {showUserProfile && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <div className="p-1">
              <button
                onClick={() => onSettingsClick('profile')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <User className="w-4 h-4" />
                My Profile
              </button>
              <button
                onClick={onUpgradeClick}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <Crown className="w-4 h-4" />
                View Plans
              </button>
              <button
                onClick={() => onSettingsClick('billing')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                Billing
              </button>
              <button
                onClick={() => onSettingsClick('profile')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={() => onSettingsClick('inviteCodes')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <Ticket className="w-4 h-4" />
                Invite Codes
              </button>
              <MobileLinkButton />
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

