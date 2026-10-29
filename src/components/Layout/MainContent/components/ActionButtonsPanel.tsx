import React, { useState } from 'react';
import { Undo, Redo, Download, Save, X, Edit2, FileText, ClipboardList } from 'lucide-react';
import { SaltExportPopup } from '@/components/Modals/SaltExportPopup';
import { SateReportPopup } from '@/components/Modals/SateReportPopup';
import { SoapNotePopup } from '@/components/Modals/SoapNotePopup';
import type { Segment } from '@/services/dataService';
import type { UndoRedoReturn } from '@/hooks/useUndoRedo';
import type { StoredLsaReport } from '@/services/lsaReportService';

interface ActionButtonsPanelProps {
  isEditable?: boolean;
  undoRedo: UndoRedoReturn;
  transcriptData: Segment[];
  recordingId?: string;
  onTranscriptChange?: (updatedSegments: Segment[]) => void;
  onSaveChanges?: () => void;
  onCancelEdit?: () => void;
  onShowCancelConfirmation: () => void;
  readOnly?: boolean;
  lsaReport?: StoredLsaReport | null;
  lsaAllowGenerate?: boolean;
  onSaveLsaReport?: (stored: StoredLsaReport) => Promise<StoredLsaReport | void>;
  /** The audio's length in seconds — prefills the SOAP note's session duration. */
  audioDuration?: number;
}

export const ActionButtonsPanel: React.FC<ActionButtonsPanelProps> = ({
  isEditable,
  undoRedo,
  transcriptData,
  recordingId,
  onTranscriptChange,
  onSaveChanges,
  onCancelEdit,
  onShowCancelConfirmation,
  readOnly = false,
  lsaReport,
  lsaAllowGenerate,
  onSaveLsaReport,
  audioDuration,
}) => {
  const [showSaltExportPopup, setShowSaltExportPopup] = useState(false);
  const [showSateReportPopup, setShowSateReportPopup] = useState(false);
  const [showSoapNotePopup, setShowSoapNotePopup] = useState(false);

  return (
    <>
      {/* Wraps as a row of whole buttons; a label never breaks across lines (four buttons since SOAP Note). */}
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
          title="Export transcript to SALT format"
        >
          <Download className="w-4 h-4" />
          Export SALT
        </button>

        {/* Generate SATE Report */}
        <button
          onClick={() => setShowSateReportPopup(true)}
          className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-50 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
          title="Generate a SATE clinical report (PDF / Word)"
        >
          <FileText className="w-4 h-4" />
          SATE Report
        </button>

        {/* SOAP Note — writes a stored draft, so it is hidden on oversight (readOnly). */}
        {!readOnly && (
          <button
            onClick={() => setShowSoapNotePopup(true)}
            className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
            title="Draft a SOAP note for this session, for SLP review"
          >
            <ClipboardList className="w-4 h-4" />
            SOAP Note
          </button>
        )}

      {/* Edit Mode Toggle */}
      {readOnly ? null : isEditable ? (
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                await onSaveChanges?.();
              } catch {
                // The history is the only record of the edits and the source of
                // hasUnsavedChanges, so a failed save must keep it armed.
                return;
              }
              // Clear history after successful save
              undoRedo.clearHistory();
            }}
            className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
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
            className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
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
          className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none transition-all duration-200 shadow-sm"
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

      {/* SATE Report Popup */}
      <SateReportPopup
        isOpen={showSateReportPopup}
        onClose={() => setShowSateReportPopup(false)}
        recordingId={recordingId}
        transcriptData={transcriptData}
        readOnly={readOnly}
        initialReport={lsaReport}
        allowGenerate={lsaAllowGenerate}
        saveReport={onSaveLsaReport}
      />

      {/* SOAP Note Popup */}
      {!readOnly && (
        <SoapNotePopup
          isOpen={showSoapNotePopup}
          onClose={() => setShowSoapNotePopup(false)}
          recordingId={recordingId}
          transcriptData={transcriptData}
          audioDuration={audioDuration}
        />
      )}
    </>
  );
};
