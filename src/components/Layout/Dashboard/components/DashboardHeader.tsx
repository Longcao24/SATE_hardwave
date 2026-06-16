import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '../../../ui/button';

interface DashboardHeaderProps {
  onShowGuide: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onShowGuide }) => {
  return (
    <div className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">SLP Dashboard</h1>
        <p className="text-gray-600">Manage your speech therapy practice and track patient progress</p>
      </div>
      <Button
        onClick={onShowGuide}
        variant="outline"
        className="flex items-center gap-2"
      >
        <HelpCircle className="w-4 h-4" />
        Show Guide
      </Button>
    </div>
  );
};

export default DashboardHeader;


