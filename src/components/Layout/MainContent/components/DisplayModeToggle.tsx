import React from 'react';

interface DisplayModeToggleProps {
  isSimpleAnnotationMode: boolean;
  onToggle: (isSimple: boolean) => void;
  hasEditedSegments?: boolean;
}

export const DisplayModeToggle: React.FC<DisplayModeToggleProps> = ({
  isSimpleAnnotationMode,
  onToggle,
  // hasEditedSegments = false,
}) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-600">Display:</span>
      <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => onToggle(true)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
            isSimpleAnnotationMode
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Simple
        </button>
        {/* Hide Advanced button if any segments are edited */}
        {/* {!hasEditedSegments && ( */}
        {(
          <button
            onClick={() => onToggle(false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              !isSimpleAnnotationMode
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Advanced
          </button>
        )}
      </div>
    </div>
  );
};


