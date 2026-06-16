import React from 'react';
import { Info } from 'lucide-react';

interface HelpTooltipProps {
  onClose: () => void;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ onClose }) => {
  return (
    <div className="help-tooltip absolute right-0 top-full mt-2 w-80 bg-white border border-gray-300 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
      <div className="flex items-center justify-between mb-3 p-4 pb-0">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Info size={16} />
          Edit Mode Help
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-3 text-xs text-gray-700 p-4 pt-0 max-h-80 overflow-y-auto">
        <div>
          <h4 className="font-medium mb-1">Edit Mode:</h4>
          <p>Double-click on any segment to edit its content, split it, or modify timing. Drag segments onto each other to merge them.</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Selection Mode:</h4>
          <p>Select multiple segments to change their speaker or perform bulk operations.</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Merge Mode:</h4>
          <p>Select 2 adjacent segments to merge them into a single segment.</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Annotation Mode:</h4>
          <p>Select words in the transcript to add new annotations like filler words, repetitions, or speech errors.</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Split Mode:</h4>
          <p>Click on any segment to split it into two separate segments at a specific word position.</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Exclude Mode:</h4>
          <p>Click on segments to exclude or include them from the analysis. Excluded segments are grayed out.</p>
        </div>
        
        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            💡 <strong>Tip:</strong> Use the toolbar buttons to activate different edit modes. The toolbar stays visible while you scroll through your transcript.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpTooltip;
