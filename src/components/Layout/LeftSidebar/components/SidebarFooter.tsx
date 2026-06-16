import React from 'react';
import { Button } from '@/components/ui/button';

export const SidebarFooter: React.FC = () => {
  return (
    <div className="p-6 border-t border-gray-200 flex-shrink-0">
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => window.open('https://sate.agency/guideline', '_blank')}
          className="w-full text-sm bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300"
        >
          Guidelines video
        </Button>
        
        <Button
          variant="outline"
          onClick={() => window.open('https://forms.gle/253ec14WutjStM8GA', '_blank')}
          className="w-full text-sm bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300"
        >
          Report Issue
        </Button>
      </div>
    </div>
  );
};

