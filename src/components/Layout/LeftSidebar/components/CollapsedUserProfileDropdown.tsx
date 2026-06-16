import React from 'react';
import { User, Crown, CreditCard, Settings, Ticket, LogOut } from 'lucide-react';

interface CollapsedUserProfileDropdownProps {
  show: boolean;
  onSettingsClick: (section: 'profile' | 'billing' | 'inviteCodes') => void;
  onUpgradeClick: () => void;
  onLogout: () => void;
}

export const CollapsedUserProfileDropdown: React.FC<CollapsedUserProfileDropdownProps> = ({
  show,
  onSettingsClick,
  onUpgradeClick,
  onLogout
}) => {
  if (!show) return null;

  return (
    <div 
      className="fixed left-[70px] bottom-16 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] min-w-[200px]"
      data-profile-dropdown
    >
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
  );
};

