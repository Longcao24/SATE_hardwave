import React, { useState } from 'react';
import { Undo, Redo, Download, Save, X, Edit2 } from 'lucide-react';
import { SaltExportPopup } from '@/components/Modals/SaltExportPopup';
import type { Segment } from '@/services/dataService';
import type { UndoRedoReturn } from '@/hooks/useUndoRedo';

interface ActionButtonsPanelProps {
  isEditable?: boolean;
  undoRedo: UndoRedoReturn;
  transcriptData: Segment[];
  onTranscriptChange?: (updatedSegments: Segment[]) => void;
  onSaveChanges?: () => void;
  onCancelEdit?: () => void;
  onShowCancelConfirmation: () => void;
}

export const ActionButtonsPanel: React.FC<ActionButtonsPanelProps> = ({
  isEditable,
  undoRedo,
  transcriptData,
  onTranscriptChange,
  onSaveChanges,
  onCancelEdit,
  onShowCancelConfirmation,
}) => {
  const [showSaltExportPopup, setShowSaltExportPopup] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        {/* Undo/Redo Buttons - Only show in edit mode */}
        {isEditable && (
          <div className="flex items-center gap-1">
            <button
              onClick={undoRedo.undo}
              disabled={!undoRedo.canUndo}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm ${
                undoRedo.canUndo
                  ? 'text-blue-700 bg-white border border-blue-300 hover:bg-blue-50'
                  : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
              }`}
              title={`Undo (Ctrl+Z) - ${undoRedo.historyStats.undoCount} action${undoRedo.historyStats.undoCount !== 1 ? 's' : ''} available`}
            >
              <Undo className="w-4 h-4" />
              <span className="text-xs">Undo</span>
            </button>
            <button
              onClick={undoRedo.redo}
              disabled={!undoRedo.canRedo}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm ${
                undoRedo.canRedo
                  ? 'text-blue-700 bg-white border border-blue-300 hover:bg-blue-50'
                  : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
              }`}
              title={`Redo (Ctrl+Y) - ${undoRedo.historyStats.redoCount} action${undoRedo.historyStats.redoCount !== 1 ? 's' : ''} available`}
            >
              <Redo className="w-4 h-4" />
              <span className="text-xs">Redo</span>
            </button>
          </div>
        )}

        {/* Export SALT Button */}
        <button
          onClick={() => setShowSaltExportPopup(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
          title="Export transcript to SALT format"
        >
          <Download className="w-4 h-4" />
          Export SALT
        </button>

      {/* Edit Mode Toggle */}
      {isEditable ? (
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await onSaveChanges?.();
              // Clear history after successful save
              undoRedo.clearHistory();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
            title="Save changes"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => {
              // Check if there are unsaved changes
              if (undoRedo.hasUnsavedChanges) {
                onShowCancelConfirmation();
              } else {
                // No unsaved changes, cancel immediately
                undoRedo.clearHistory();
                onCancelEdit?.();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
            title="Cancel editing"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => onTranscriptChange && onTranscriptChange(transcriptData)}
          data-umami-event="edit_button_click"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
          title="Enable edit mode"
        >
          <Edit2 className="w-4 h-4" />
          Edit
        </button>
      )}
      </div>

      {/* SALT Export Popup */}
      <SaltExportPopup
        isOpen={showSaltExportPopup}
        onClose={() => setShowSaltExportPopup(false)}
        transcriptData={transcriptData}
      />
    </>
  );
};
