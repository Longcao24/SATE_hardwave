import { Card } from '@/components/ui/card';
import { User, BarChart3, TrendingUp } from 'lucide-react';

interface TabNavigationProps {
  activeTab: 'overview' | 'analytics' | 'reports';
  onTabChange: (tab: 'overview' | 'analytics' | 'reports') => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: User },
    { key: 'reports' as const, label: 'Reports', icon: BarChart3 },
    { key: 'analytics' as const, label: 'Analytics', icon: TrendingUp },
  ];

  return (
    <Card className="mb-8 bg-white shadow-sm border-0">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </Card>
  );
};

