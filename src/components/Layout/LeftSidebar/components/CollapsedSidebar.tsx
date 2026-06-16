import React, { useState } from 'react';
import { LayoutDashboard, Users, AudioLines, User, PanelLeft } from 'lucide-react';

interface CollapsedSidebarProps {
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onProfileClick: () => void;
  hasUser: boolean;
}

export const CollapsedSidebar: React.FC<CollapsedSidebarProps> = ({
  onToggle,
  onNavigate,
  onProfileClick,
  hasUser
}) => {
  const [logoHovered, setLogoHovered] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-3 border-b border-gray-200 flex-shrink-0">
        <div 
          className="relative cursor-pointer flex justify-center"
          onClick={onToggle}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          title="Click to expand sidebar"
        >
          <img 
            src="/img.svg"
            alt="SATE" 
            className={`h-10 w-10 transition-all ${logoHovered ? 'opacity-0' : 'opacity-100'}`}
          />
          {logoHovered && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg transition-all">
              <PanelLeft className="w-6 h-6 text-black" />
            </div>
          )}
        </div>
      </div>

      {/* Icon Menu */}
      <div className="flex-1 flex flex-col items-center py-6 gap-4 overflow-y-auto">
        <button
          onClick={() => onNavigate('/')}
          className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Home"
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>
        
        <button
          onClick={() => onNavigate('/patients')}
          className="p-3 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
          title="Patients"
        >
          <Users className="w-6 h-6" />
        </button>
        
        <button
          onClick={onToggle}
          className="p-3 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
          title="Recordings - Click to expand"
        >
          <AudioLines className="w-6 h-6" />
        </button>
        
        <div className="flex-1"></div>
        
        {hasUser && (
          <button
            onClick={onProfileClick}
            className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Profile"
            data-profile-button
          >
            <User className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

