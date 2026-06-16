import { useState, useEffect } from 'react';
import { type Patient, patientService } from '@/services/patientService';

export const usePatientData = (patientId?: string) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (patientId) {
      loadPatientData(patientId);
    }
  }, [patientId]);

  const loadPatientData = async (id: string) => {
    try {
      setLoading(true);
      const patientData = await patientService.getPatient(id);
      setPatient(patientData);
    } catch (error) {
      console.error('Failed to load patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  return { patient, loading, refetch: () => patientId && loadPatientData(patientId) };
};

