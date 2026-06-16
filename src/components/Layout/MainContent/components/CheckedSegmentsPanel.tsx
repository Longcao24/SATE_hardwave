import React from 'react';
import { CheckSquare, User, Merge, EyeOff, Trash2 } from 'lucide-react';
import type { EditingState, EditingActions } from '../../../Recording/ConversationView/types';

interface CheckedSegmentsPanelProps {
  editingState: EditingState | null;
  editingActions: EditingActions | null;
}

export const CheckedSegmentsPanel: React.FC<CheckedSegmentsPanelProps> = ({
  editingState,
  editingActions,
}) => {
  if (!editingState?.checkedSegments || editingState.checkedSegments.size === 0) {
    return null;
  }

  return (
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CheckSquare size={14} className="text-blue-700" />
          <span className="text-xs font-medium text-blue-900">
            {editingState.checkedSegments.size} segment{editingState.checkedSegments.size !== 1 ? 's' : ''} checked
          </span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={editingActions?.selectAllForCheckboxes} 
            className="px-2 py-1 text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            Check All
          </button>
          <button 
            onClick={editingActions?.clearCheckedSegments} 
            className="px-2 py-1 text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={editingActions?.bulkSpeakerChange}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 rounded transition-colors flex items-center justify-center gap-1.5"
          title="Change speaker for all checked segments"
        >
          <User size={12} />
          Change Speaker
        </button>
        <button
          onClick={editingActions?.bulkMergeSegments}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 rounded transition-colors flex items-center justify-center gap-1.5"
          title="Merge all checked segments into one"
        >
          <Merge size={12} />
          Merge
        </button>
        <button
          onClick={editingActions?.bulkExcludeSegments}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 rounded transition-colors flex items-center justify-center gap-1.5"
          title="Exclude all checked segments from analysis"
        >
          <EyeOff size={12} />
          Exclude
        </button>
        <button
          onClick={editingActions?.bulkDeleteSegments}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded transition-colors flex items-center justify-center gap-1.5"
          title="Delete all checked segments"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
};


