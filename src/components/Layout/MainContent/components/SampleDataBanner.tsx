import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface SampleDataBannerProps {
  onBackToDashboard: () => void;
}

export const SampleDataBanner: React.FC<SampleDataBannerProps> = ({ 
  onBackToDashboard 
}) => {
  return (
    <div className="p-4 bg-purple-50 border-b border-purple-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-purple-600 rounded-full"></div>
          </div>
          <div>
            <p className="text-sm font-medium text-purple-800">Sample Data</p>
            <p className="text-xs text-purple-600">Exploring SATE features with sample audio</p>
          </div>
        </div>
        <button
          onClick={onBackToDashboard}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};


