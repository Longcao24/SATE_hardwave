import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecordings } from '@/hooks/useRecordings';
import { type Patient, patientService } from '@/services/patientService';
import { loadRecording } from '@/services/dataService';

export const usePatientContext = () => {
  const location = useLocation();
  const { recordings } = useRecordings();
  const [contextPatientId, setContextPatientId] = useState<string | null>(null);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);

  // Detect patient context from current route
  useEffect(() => {
    const detectPatientContext = async () => {
      const pathname = location.pathname;
      
      // Check if we're on a patient detail page: /patients/{patientId}
      const patientMatch = pathname.match(/^\/patients\/([^\/]+)$/);
      if (patientMatch) {
        const patientId = patientMatch[1];
        if (patientId !== 'new') {
          setContextPatientId(patientId);
          return;
        }
      }
      
      // Check if we're on a recording report page: /report/{recordingId}
      const reportMatch = pathname.match(/^\/report\/([^\/]+)$/);
      if (reportMatch) {
        const recordingId = reportMatch[1];
        try {
          const recordingData = await loadRecording(recordingId);
          if (recordingData) {
            const recording = recordings?.find(r => r.id === recordingId);
            if (recording?.patient_id) {
              setContextPatientId(recording.patient_id);
              return;
            }
          }
        } catch (error) {
          console.error('Failed to get patient context from recording:', error);
        }
      }
      
      setContextPatientId(null);
    };
    
    detectPatientContext();
  }, [location.pathname, recordings]);

  // Load current patient data when context changes
  useEffect(() => {
    const loadCurrentPatient = async () => {
      if (contextPatientId) {
        try {
          const patient = await patientService.getPatient(contextPatientId);
          setCurrentPatient(patient);
        } catch (error) {
          console.error('Failed to load current patient:', error);
          setCurrentPatient(null);
        }
      } else {
        setCurrentPatient(null);
      }
    };
    
    loadCurrentPatient();
  }, [contextPatientId]);

  return { currentPatient, contextPatientId };
};

