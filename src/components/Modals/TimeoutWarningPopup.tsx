import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface TimeoutWarningPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const TimeoutWarningPopup: React.FC<TimeoutWarningPopupProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[55]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800">Processing Taking Longer Than Expected</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-gray-600">
            <p className="mb-3">
              Your audio file is taking longer than expected to process. This may be due to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              <li>Server needs time to wake up from sleep mode</li>
              <li>High server load or temporary downtime</li>
              <li>Large file size requiring more processing time</li>
              <li>Network connectivity issues</li>
            </ul>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Please be patient.</strong> The server may need a few extra minutes to wake up and process your file. 
              The system will continue processing in the background. If it times out, you can try uploading again.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Continue Waiting
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeoutWarningPopup; 