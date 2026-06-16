import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface AnnotationModeToggleProps {
  isSimpleMode: boolean;
  onToggle: (isSimple: boolean) => void;
  className?: string;
  hasEditedSegments?: boolean;
}

const AnnotationModeToggle: React.FC<AnnotationModeToggleProps> = ({
  isSimpleMode,
  onToggle,
  className = '',
  hasEditedSegments = false
}) => {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <span className="text-sm font-semibold text-gray-700">Display:</span>
      
      {/* Modern Toggle Switch */}
      <div className="relative inline-flex items-center bg-gray-100 rounded-full p-1 shadow-inner">
        {/* Background slider - adjust position when Advanced is hidden */}
        <div 
          className={`absolute top-1 bottom-1 ${hasEditedSegments ? 'hidden' : 'w-[calc(50%-2px)]'} bg-white rounded-full shadow-sm transition-all duration-300 ease-in-out ${
            isSimpleMode ? 'left-1' : 'left-[calc(50%+1px)]'
          }`}
        />
        
        {/* Simple Mode Button */}
        <button
          onClick={() => onToggle(true)}
          className={`relative z-10 flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
            isSimpleMode || hasEditedSegments
              ? 'text-gray-900' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <EyeOff className="w-4 h-4 mr-1.5" />
          Simple
        </button>
        
        {/* Advanced Mode Button - Hide if segments are edited */}
        {!hasEditedSegments && (
          <button
            onClick={() => onToggle(false)}
            className={`relative z-10 flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
              !isSimpleMode 
                ? 'text-gray-900' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye className="w-4 h-4 mr-1.5" />
            Advanced
          </button>
        )}
      </div>
      
      {/* Description */}
      {/* <div className="flex items-center text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md border">
        {isSimpleMode ? (
          <span className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-1.5"></div>
            Pauses + 
            <div className="w-2 h-2 bg-red-500 rounded-full mx-1.5"></div>
            Mazes
          </span>
        ) : (
          <span className="flex items-center">
            <div className="flex items-center mr-1.5 space-x-0.5">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            </div>
            All annotations
          </span>
        )}
      </div> */}
    </div>
  );
};

export default AnnotationModeToggle;
