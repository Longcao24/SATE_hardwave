import React from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Patient } from '@/services/patientService';
import { type Recording } from '@/hooks/useRecordings';

interface AssignPatientModalProps {
  isOpen: boolean;
  recordingId: string | null;
  recordings: Recording[] | undefined;
  patients: Patient[];
  loadingPatients: boolean;
  onAssign: (patientId: string, wasAssigned: boolean, patientName: string) => void;
  onCancel: () => void;
  onCreateNewPatient: () => void;
}

export const AssignPatientModal: React.FC<AssignPatientModalProps> = ({
  isOpen,
  recordingId,
  recordings,
  patients,
  loadingPatients,
  onAssign,
  onCancel,
  onCreateNewPatient
}) => {
  if (!isOpen || !recordingId) return null;

  const currentRecording = recordings?.find(r => r.id === recordingId);
  const currentPatientForRecording = currentRecording?.patient_id 
    ? patients.find(p => p.id === currentRecording.patient_id)
    : null;
  const isChangingPatient = !!currentRecording?.patient_id;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isChangingPatient ? 'Change Patient' : 'Assign to Patient'}
            </h3>
            <p className="text-sm text-gray-600">
              {isChangingPatient 
                ? `Currently assigned to ${currentPatientForRecording?.first_name} ${currentPatientForRecording?.last_name}`
                : 'Select a patient for this recording'
              }
            </p>
          </div>
        </div>
        
        {loadingPatients ? (
          <p className="text-sm text-gray-500 mb-6">Loading patients...</p>
        ) : patients.length === 0 ? (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">No patients available. Create a patient first.</p>
            <Button
              onClick={onCreateNewPatient}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Patient
            </Button>
          </div>
        ) : (
          <div className="mb-6 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  const wasAssigned = !!currentRecording?.patient_id;
                  const patientName = `${patient.first_name} ${patient.last_name}`;
                  onAssign(patient.id, wasAssigned, patientName);
                }}
                className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">
                  {patient.first_name} {patient.last_name}
                </p>
                {patient.diagnosis && (
                  <p className="text-xs text-gray-600">{patient.diagnosis}</p>
                )}
              </button>
            ))}
          </div>
        )}
        
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

