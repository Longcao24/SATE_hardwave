import React from 'react';
import { Button } from '../ui/button';
import { Calendar, Clock, Users } from 'lucide-react';
import { SubscriptionBadge } from '../Stripe/SubscriptionBadge';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: SATE Logo */}
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-gray-900">SATE</h1>
        </div>

        {/* Center: Note Info */}
        <div className="flex-1 flex flex-col items-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Note 1</h2>
          <div className="flex items-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <Calendar className="w-4 h-4" />
              <span>April 12, 2025</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>1 min 17 sec</span>
            </div>
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>2 people</span>
            </div>
          </div>
        </div>

        {/* Right: Speech Analysis Tabs & Subscription */}
        <div className="flex items-center space-x-4">
          <div className="text-lg font-semibold text-gray-900 mr-4">Speech Analysis</div>
          <div className="flex items-center space-x-1">
            <Button
              variant={activeTab === 'overview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange('overview')}
              className={`px-4 py-2 text-sm ${
                activeTab === 'overview' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </Button>
            <Button
              variant={activeTab === 'issues' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange('issues')}
              className={`px-4 py-2 text-sm ${
                activeTab === 'issues' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Issues
            </Button>
            <Button
              variant={activeTab === 'annotations' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTabChange('annotations')}
              className={`px-4 py-2 text-sm ${
                activeTab === 'annotations' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active Annotations
            </Button>
          </div>
          <div className="ml-6 pl-6 border-l border-gray-200">
            <SubscriptionBadge variant="compact" showUpgrade={false} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 