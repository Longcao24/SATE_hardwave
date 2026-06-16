import React from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { formatDuration, formatDate } from '../utils';

interface ReportHeaderProps {
  recordingName?: string;
  createdDate?: string;
  duration: number;
  isEditing: boolean;
  editedName: string;
  onEditedNameChange: (name: string) => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  recordingName,
  createdDate,
  duration,
  isEditing,
  editedName,
  onEditedNameChange,
  onEditStart,
  onEditSave,
  onEditCancel,
  onKeyPress,
}) => {
  return (
    <div className="flex-1">
      {/* Report Title */}
      <div className="flex items-center gap-2 mb-2">
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={editedName}
              onChange={(e) => onEditedNameChange(e.target.value)}
              onKeyDown={onKeyPress}
              className="text-xl font-semibold text-gray-800 bg-white border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              placeholder="Enter report name"
            />
            <button
              onClick={onEditSave}
              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={onEditCancel}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h2 className="text-xl font-semibold text-gray-800">
              {recordingName || "Untitled Report"}
            </h2>
            <button
              onClick={onEditStart}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit report name"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      
      {/* Report Metadata */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <span className="font-medium">Created:</span>
          <span>{formatDate(createdDate)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">Duration:</span>
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium">Type:</span>
          <span>Speech Analysis Report</span>
        </div>
      </div>
    </div>
  );
};


