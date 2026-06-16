import React, { useState, useEffect } from 'react';
import { X, Users, UserCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { type Patient, patientService } from '@/services/patientService';
import { ProgressStepper } from '../Common/ProgressStepper';

interface CreateRecordingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onImportAudio: (patientId?: string) => void;
  preSelectedPatientId?: string; // Patient is already known, skip selection
  preSelectedPatientName?: string; // Display name for confirmation
}

const CreateRecordingPopup: React.FC<CreateRecordingPopupProps> = ({
  isOpen,
  onClose,
  onImportAudio,
  preSelectedPatientId,
  preSelectedPatientName
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // Load patients when popup opens
  useEffect(() => {
    if (isOpen) {
      loadPatients();
      setSelectedPatientId(''); // Reset selection when opening
    }
  }, [isOpen]);

  const loadPatients = async () => {
    try {
      setLoadingPatients(true);
      const data = await patientService.getPatients();
      setPatients(data);
    } catch (error) {
      console.error('Failed to load patients:', error);
    } finally {
      setLoadingPatients(false);
    }
  };

  if (!isOpen) return null;

  const recordingSteps = [
    { number: 1, title: 'Assign Patient', description: 'Select patient' },
    { number: 2, title: 'Import Audio', description: 'Upload file' },
    { number: 3, title: 'Fill Details', description: 'Add metadata' },
    { number: 4, title: 'Save', description: 'Complete' },
  ];

  const handleImportAudio = () => {
    onClose();
    // Use pre-selected patient if available, otherwise use selected patient
    const patientId = preSelectedPatientId || selectedPatientId || undefined;
    onImportAudio(patientId);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 h-auto max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Create New Recording</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Stepper */}
        <div className="flex-shrink-0">
          <ProgressStepper currentStep={1} steps={recordingSteps} />
        </div>

        {/* Patient Assignment - Scrollable */}
        <div className="overflow-y-auto max-h-96">
        {preSelectedPatientId ? (
          /* Patient Already Selected - Show Confirmation */
          <div className="px-6 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-medium text-gray-900">Recording for Patient</h3>
            </div>
            
            <div className="flex items-center p-2.5 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                  {preSelectedPatientName?.split(' ').map(n => n.charAt(0)).join('') || 'P'}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900">
                    {preSelectedPatientName || 'Selected Patient'}
                  </p>
                  <p className="text-xs text-green-700">Recording will be automatically assigned to this patient</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Patient Selection Interface */
          <div className="px-6 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-medium text-gray-900">Assign to Patient</h3>
            </div>
            
            {loadingPatients ? (
              <div className="text-center py-4">
                <div className="text-gray-500">Loading patients...</div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* No Patient Option */}
                <label className="flex items-center p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="patient"
                    value=""
                    checked={selectedPatientId === ''}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="mr-3 text-blue-600"
                  />
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <UserCheck className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm">No Patient (Standalone)</p>
                      <p className="text-xs text-gray-600">One-time recording</p>
                    </div>
                  </div>
                </label>

                {/* Patient Options */}
                {patients.map((patient) => (
                  <label
                    key={patient.id}
                    className="flex items-center p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="patient"
                      value={patient.id}
                      checked={selectedPatientId === patient.id}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                      className="mr-3 text-blue-600"
                    />
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {patient.first_name} {patient.last_name}
                        </p>
                        {patient.diagnosis && (
                          <p className="text-xs text-gray-600 truncate">{patient.diagnosis}</p>
                        )}
                      </div>
                    </div>
                  </label>
                ))}

                {patients.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm mb-1">No patients found</p>
                    <p className="text-xs text-gray-400">You can still create standalone recordings</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <Button
            onClick={handleImportAudio}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateRecordingPopup; 