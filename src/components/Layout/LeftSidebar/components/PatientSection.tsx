import React from 'react';
import { Users, User, FileText, UserCheck, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Patient } from '@/services/patientService';

interface PatientSectionProps {
  currentPatient: Patient | null;
  patients: Patient[];
  loadingPatients: boolean;
  selectedFilterPatientId: string | null;
  onNavigate: (path: string) => void;
  onPatientClick: (patientId: string) => void;
  onClearFilter: () => void;
}

export const PatientSection: React.FC<PatientSectionProps> = ({
  currentPatient,
  patients,
  loadingPatients,
  selectedFilterPatientId,
  onNavigate,
  onPatientClick,
  onClearFilter
}) => {
  return (
    <div className="px-6 pt-6 pb-6 border-t border-gray-200 flex-shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4" /> 
          Patients
        </h3>
        {selectedFilterPatientId && !currentPatient && (
          <button
            onClick={onClearFilter}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            title="Show all recordings"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
      
      {/* Current Patient Display (on patient detail page) */}
      {currentPatient ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 truncate">
                  {currentPatient.first_name} {currentPatient.last_name}
                </p>
                {currentPatient.diagnosis && (
                  <p className="text-xs text-blue-700 truncate">
                    {currentPatient.diagnosis}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={() => onNavigate(`/patients/${currentPatient.id}`)}
              variant="outline"
              size="sm"
              className="flex-1 text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
            >
              <FileText className="w-3 h-3 mr-1" />
              Details
            </Button>
            <Button
              onClick={() => onNavigate('/patients')}
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
            >
              <Users className="w-3 h-3 mr-1" />
              All Patients
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Action Buttons */}
          <div className="space-y-2 mb-4">
            <Button
              onClick={() => onNavigate('/patients')}
              variant="outline"
              className="w-full text-sm bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              Manage Patients
            </Button>
            
            <Button
              onClick={() => onNavigate('/patients/new')}
              variant="outline"
              className="w-full text-sm bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Patient
            </Button>
          </div>

          {/* Patients List - Always Visible */}
          <div>
            <h4 className="text-xs font-medium text-gray-600 mb-2">Filter by Patient</h4>
            {loadingPatients ? (
              <p className="text-xs text-gray-500">Loading patients...</p>
            ) : patients.length === 0 ? (
              <p className="text-xs text-gray-500">No patients yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {patients.map((patient) => {
                  const isSelected = selectedFilterPatientId === patient.id;
                  return (
                    <button
                      key={patient.id}
                      onClick={() => onPatientClick(patient.id)}
                      className={`w-full text-left p-2 rounded-md transition-colors group ${
                        isSelected 
                          ? 'bg-blue-100 border border-blue-300' 
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-medium truncate ${
                            isSelected ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {patient.first_name} {patient.last_name}
                          </p>
                          {patient.diagnosis && (
                            <p className={`text-xs truncate ${
                              isSelected ? 'text-blue-700' : 'text-gray-600'
                            }`}>
                              {patient.diagnosis}
                            </p>
                          )}
                        </div>
                        <User className={`w-3 h-3 flex-shrink-0 ml-2 ${
                          isSelected 
                            ? 'text-blue-600' 
                            : 'text-gray-400 group-hover:text-gray-600'
                        }`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

