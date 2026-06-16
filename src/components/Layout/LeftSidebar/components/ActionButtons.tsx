import React from 'react';
import { LayoutDashboard, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActionButtonsProps {
  showDashboardButton: boolean;
  onNavigate: (path: string) => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  showDashboardButton,
  onNavigate
}) => {
  return (
    <div className="px-6 pb-6 space-y-3 flex-shrink-0">
      {showDashboardButton && (
        <Button
          onClick={() => onNavigate('/')}
          variant="outline"
          className="w-full text-sm bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300 flex items-center justify-center gap-2"
        >
          <LayoutDashboard className="w-4 h-4" />
          Back to Dashboard
        </Button>
      )}
      
      <Button
        onClick={() => onNavigate('/devices')}
        variant="outline"
        className="w-full text-sm bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 flex items-center justify-center gap-2"
      >
        <Mic className="w-4 h-4" />
        Manage Devices
      </Button>
    </div>
  );
};

