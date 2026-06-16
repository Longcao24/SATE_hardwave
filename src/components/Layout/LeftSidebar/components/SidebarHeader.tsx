import React from 'react';
import { PanelLeft } from 'lucide-react';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  width: number;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  collapsed,
  onToggle,
  onNavigate,
  width
}) => {

  if (collapsed) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 flex-shrink-0 p-4">
      <div className="flex items-center gap-3">
        <img 
          src="/LOGO.png"
          alt="SATE" 
          className="cursor-pointer transition-all h-16 w-auto"
          onClick={() => onNavigate('/')}
          title="Go to Dashboard"
        />
        {width > 290 && (
          <a 
            className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded-full whitespace-nowrap" 
            href="https://doc.sate.agency" 
            target="_blank"
          >
            v1.5.9
          </a>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-300 hover:border-blue-400"
          title="Collapse sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

