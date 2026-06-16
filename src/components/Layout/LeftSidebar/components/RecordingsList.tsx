import React from 'react';
import { AudioLines, MoreVertical, Edit, UserPlus, UserX, Trash2, Plus } from 'lucide-react';
import { type Recording } from '@/hooks/useRecordings';
import { type Patient } from '@/services/patientService';

interface RecordingsListProps {
  recordings: Recording[] | undefined;
  currentPatient: Patient | null;
  patients: Patient[];
  selectedFilterPatientId: string | null;
  isLoading: boolean;
  error: Error | null;
  openMenuRecordingId: string | null;
  isDeleting: string | null;
  isMovingToStandalone: string | null;
  onRecordingClick: (recording: Recording) => void;
  onMenuToggle: (recordingId: string, e: React.MouseEvent) => void;
  onRenameClick: (recording: Recording, e: React.MouseEvent) => void;
  onAssignPatientClick: (recordingId: string, e: React.MouseEvent) => void;
  onMoveToStandaloneClick: (recording: Recording, e: React.MouseEvent) => void;
  onDeleteClick: (recordingId: string, recordingName: string, e: React.MouseEvent) => void;
  truncateFileName: (name: string) => string;
  onCreateRecording?: () => void;
}

export const RecordingsList: React.FC<RecordingsListProps> = ({
  recordings,
  currentPatient,
  patients,
  selectedFilterPatientId,
  isLoading,
  error,
  openMenuRecordingId,
  isDeleting,
  isMovingToStandalone,
  onRecordingClick,
  onMenuToggle,
  onRenameClick,
  onAssignPatientClick,
  onMoveToStandaloneClick,
  onDeleteClick,
  truncateFileName,
  onCreateRecording
}) => {
  // Helper function to get patient name from patient_id
  const getPatientName = (patientId: string | null | undefined) => {
    if (!patientId) return null;
    const patient = patients.find(p => p.id === patientId);
    return patient ? `${patient.first_name} ${patient.last_name}` : null;
  };
  
  // Get the filtered patient if one is selected
  const filteredPatient = selectedFilterPatientId ? patients.find(p => p.id === selectedFilterPatientId) : null;
  
  // Determine the title
  let title = 'Your Recordings';
  let subtitle = null;
  
  if (currentPatient) {
    title = `${currentPatient.first_name} ${currentPatient.last_name}'s Recordings`;
    subtitle = 'Showing recordings for this patient only';
  } else if (filteredPatient) {
    title = `${filteredPatient.first_name} ${filteredPatient.last_name}'s Recordings`;
    
  }
  
  return (
    <div className="flex-1 border-t border-gray-200 min-h-0 flex flex-col">
      <div className="p-6 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <AudioLines className="w-4 h-4" /> 
            {title}
          </h3>
          {onCreateRecording && (
            <button
              onClick={onCreateRecording}
              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
              title="Create new recording"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
        {isLoading && <p className="text-xs text-gray-500">Loading...</p>}
        {error && <p className="text-xs text-red-600">Failed to load recordings</p>}
        {(!recordings || recordings.length === 0) && !isLoading && (
          <p className="text-xs text-gray-500">
            {currentPatient ? 'No recordings for this patient yet.' : 'No recordings yet.'}
          </p>
        )}
        
        <ul className="space-y-2">
          {recordings?.map((r: Recording) => {
            const patientName = getPatientName(r.patient_id);
            const recordingDisplayName = r.recording_name || r.file_name || r.file_path.split('/').pop() || '';
            
            return (
            <li key={r.id} className="group relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRecordingClick(r)}
                  className="flex-1 text-left text-sm text-gray-800 hover:bg-gray-100 p-2 rounded-lg flex justify-between items-start"
                  title={patientName ? `${recordingDisplayName} (${patientName})` : recordingDisplayName}
                >
                  <div className="flex flex-col gap-0.5 truncate flex-1 min-w-0">
                    <span className="truncate">
                      {truncateFileName(recordingDisplayName)}
                    </span>
                    {patientName && !currentPatient && !selectedFilterPatientId && (
                      <span className="text-xs text-blue-600 truncate">
                        ({patientName})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{new Date(r.created_at).toLocaleDateString()}</span>
                </button>
                
                <div className="relative">
                  <button
                    onClick={(e) => onMenuToggle(r.id, e)}
                    data-recording-menu-button
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-700 transition-all duration-200"
                    title="More options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {openMenuRecordingId === r.id && (
                    <div 
                      data-recording-menu-dropdown
                      className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px]"
                    >
                      <div className="p-1">
                        <button
                          onClick={(e) => onRenameClick(r, e)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          Rename
                        </button>
                        <button
                          onClick={(e) => onAssignPatientClick(r.id, e)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                        >
                          <UserPlus className="w-4 h-4" />
                          {r.patient_id ? 'Change Patient' : 'Assign to Patient'}
                        </button>
                        {r.patient_id && (
                          <button
                            onClick={(e) => onMoveToStandaloneClick(r, e)}
                            disabled={isMovingToStandalone === r.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-orange-600 hover:bg-orange-50 rounded-md transition-colors disabled:opacity-50"
                          >
                            <UserX className="w-4 h-4" />
                            Move to Standalone
                          </button>
                        )}
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={(e) => onDeleteClick(r.id, r.recording_name || r.file_name || r.file_path.split('/').pop() || 'Unknown', e)}
                          disabled={isDeleting === r.id}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

