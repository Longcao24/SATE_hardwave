import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { type Recording } from '@/hooks/useRecordings';
import { type Patient } from '@/services/patientService';
import { updateRecordingName, updateRecordingPatient } from '@/services/dataService';

interface ActionToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

interface MoveToStandaloneState {
  show: boolean;
  recordingId: string;
  recordingName: string;
  patientName: string;
}

export const useRecordingActions = (patients: Patient[]) => {
  const { user } = useAuth();
  
  // Rename state
  const [renameRecordingId, setRenameRecordingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Assign patient state
  const [assignPatientRecordingId, setAssignPatientRecordingId] = useState<string | null>(null);
  
  // Move to standalone state
  const [moveToStandaloneConfirm, setMoveToStandaloneConfirm] = useState<MoveToStandaloneState>({
    show: false,
    recordingId: '',
    recordingName: '',
    patientName: ''
  });
  const [isMovingToStandalone, setIsMovingToStandalone] = useState<string | null>(null);
  
  // Toast notification
  const [actionToast, setActionToast] = useState<ActionToastState>({
    show: false,
    message: '',
    type: 'success'
  });

  // Auto-hide toast
  useEffect(() => {
    if (actionToast.show) {
      const timer = setTimeout(() => {
        setActionToast({ show: false, message: '', type: 'success' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [actionToast.show]);

  // Rename handlers
  const handleRenameClick = useCallback((recording: Recording, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameRecordingId(recording.id);
    setRenameValue(recording.recording_name || recording.file_name || '');
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!user || !renameRecordingId || !renameValue.trim()) return;
    
    try {
      const result = await updateRecordingName(renameRecordingId, renameValue.trim(), user.id);
      
      if (result.success) {
        setActionToast({
          show: true,
          message: 'Recording renamed successfully',
          type: 'success'
        });
      } else {
        setActionToast({
          show: true,
          message: result.error || 'Failed to rename recording',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Rename error:', error);
      setActionToast({
        show: true,
        message: 'An error occurred while renaming',
        type: 'error'
      });
    } finally {
      setRenameRecordingId(null);
      setRenameValue('');
    }
  }, [user, renameRecordingId, renameValue]);

  const handleRenameCancel = useCallback(() => {
    setRenameRecordingId(null);
    setRenameValue('');
  }, []);

  // Assign patient handlers
  const handleAssignPatientClick = useCallback((recordingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAssignPatientRecordingId(recordingId);
  }, []);

  const handleAssignPatient = useCallback(async (patientId: string, wasAssigned: boolean, patientName: string) => {
    if (!user || !assignPatientRecordingId) return;
    
    try {
      const result = await updateRecordingPatient(assignPatientRecordingId, patientId, user.id);
      
      if (result.success) {
        setActionToast({
          show: true,
          message: wasAssigned 
            ? `Recording reassigned to ${patientName}`
            : `Recording assigned to ${patientName}`,
          type: 'success'
        });
      } else {
        setActionToast({
          show: true,
          message: result.error || `Failed to ${wasAssigned ? 'change' : 'assign'} recording`,
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Assign patient error:', error);
      setActionToast({
        show: true,
        message: `An error occurred while ${wasAssigned ? 'changing' : 'assigning'} patient`,
        type: 'error'
      });
    } finally {
      setAssignPatientRecordingId(null);
    }
  }, [user, assignPatientRecordingId]);

  const handleAssignPatientCancel = useCallback(() => {
    setAssignPatientRecordingId(null);
  }, []);

  // Move to standalone handlers
  const handleMoveToStandaloneClick = useCallback((recording: Recording, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const patient = patients.find(p => p.id === recording.patient_id);
    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
    
    setMoveToStandaloneConfirm({
      show: true,
      recordingId: recording.id,
      recordingName: recording.recording_name || recording.file_name || 'Unknown',
      patientName
    });
  }, [patients]);

  const handleMoveToStandaloneConfirm = useCallback(async () => {
    if (!user || !moveToStandaloneConfirm.recordingId) return;
    
    setIsMovingToStandalone(moveToStandaloneConfirm.recordingId);
    
    try {
      const result = await updateRecordingPatient(moveToStandaloneConfirm.recordingId, null, user.id);
      
      setActionToast({
        show: true,
        message: result.success 
          ? `"${moveToStandaloneConfirm.recordingName}" moved to standalone recordings`
          : result.error || 'Failed to move recording',
        type: result.success ? 'success' : 'error'
      });
    } catch (error) {
      console.error('Move to standalone error:', error);
      setActionToast({
        show: true,
        message: 'An error occurred while moving the recording',
        type: 'error'
      });
    } finally {
      setIsMovingToStandalone(null);
      setMoveToStandaloneConfirm({ show: false, recordingId: '', recordingName: '', patientName: '' });
    }
  }, [user, moveToStandaloneConfirm]);

  const handleMoveToStandaloneCancel = useCallback(() => {
    setMoveToStandaloneConfirm({ show: false, recordingId: '', recordingName: '', patientName: '' });
  }, []);

  return {
    // Rename
    renameRecordingId,
    renameValue,
    setRenameValue,
    handleRenameClick,
    handleRenameConfirm,
    handleRenameCancel,
    
    // Assign patient
    assignPatientRecordingId,
    handleAssignPatientClick,
    handleAssignPatient,
    handleAssignPatientCancel,
    
    // Move to standalone
    moveToStandaloneConfirm,
    isMovingToStandalone,
    handleMoveToStandaloneClick,
    handleMoveToStandaloneConfirm,
    handleMoveToStandaloneCancel,
    
    // Toast
    actionToast
  };
};

