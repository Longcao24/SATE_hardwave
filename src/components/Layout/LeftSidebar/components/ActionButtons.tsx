import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Mic, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deviceApiService } from '@/services/device/deviceApiService';

interface ActionButtonsProps {
  showDashboardButton: boolean;
  onNavigate: (path: string) => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  showDashboardButton,
  onNavigate
}) => {
  // Show the Admin entry only to users in sate_admins (checked via the API).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    deviceApiService.amIAdmin().then((ok) => { if (!cancelled) setIsAdmin(ok); });
    return () => { cancelled = true; };
  }, []);

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

      {isAdmin && (
        <Button
          onClick={() => onNavigate('/admin')}
          variant="outline"
          className="w-full text-sm bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 hover:border-violet-300 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" />
          Admin
        </Button>
      )}
    </div>
  );
};

