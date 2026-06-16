import React from 'react';
import { PanelLeft } from 'lucide-react';

interface LeftSidebarToggleProps {
  visible: boolean;
  onClick: () => void;
}

const LeftSidebarToggle: React.FC<LeftSidebarToggleProps> = ({ visible, onClick }) => {
  if (visible) return null;
  
  return (
    <button 
      onClick={onClick}
      className="fixed left-0 top-0 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-br-lg px-3 py-3 shadow-lg hover:shadow-xl transition-all duration-200 group hover:px-4"
      title="Show sidebar (Ctrl+B)"
    >
      <PanelLeft className="w-6 h-6" />
    </button>
  );
};

export default LeftSidebarToggle; 