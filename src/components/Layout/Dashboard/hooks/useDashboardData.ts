import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/supabase';
import { 
  patientService, 
  type Patient
} from '@/services/patientService';
import type { PatientStats, DashboardSummary } from '../types';

export const useDashboardData = () => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientStats, setPatientStats] = useState<PatientStats[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const hasLoadedData = useRef(false);

  // Load patient data and calculate dashboard metrics
  useEffect(() => {
    const loadPatientData = async () => {
      if (!user) return;
      
      // Only load once per user session
      if (hasLoadedData.current) return;
      
      setLoadingPatients(true);
      
      try {
        // Load all patients
        const patientsData = await patientService.getPatients();
        setPatients(patientsData);

        // Calculate dashboard summary
        const now = new Date();
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const newPatientsThisMonth = patientsData.filter(p => 
          new Date(p.created_at) >= oneMonthAgo
        ).length;

        // For each patient, load recordings to calculate stats
        const patientStatsPromises = patientsData.slice(0, 10).map(async (patient) => {
          try {
            // Get recordings for this patient (which serve as sessions in this context)
            const { data: recordings, error } = await supabase
              .from('recordings')
              .select('created_at, file_name')
              .eq('patient_id', patient.id)
              .order('created_at', { ascending: false });

            if (error) {
              console.error(`Error loading recordings for patient ${patient.id}:`, error);
              throw error;
            }

            const patientRecordings = recordings || [];
            const recentSession = patientRecordings[0]?.created_at;
            
            // Calculate age if date of birth exists
            const age = patient.date_of_birth ? 
              Math.floor((now.getTime() - new Date(patient.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365)) : 
              undefined;

            // Simple progress trend calculation based on recent recordings
            const recentRecordings = patientRecordings.filter(r => new Date(r.created_at) >= oneMonthAgo);
            const progressTrend: 'improving' | 'stable' | 'declining' = 
              recentRecordings.length >= 2 ? 'improving' : 
              recentRecordings.length === 1 ? 'stable' : 'declining';

            return {
              id: patient.id,
              name: `${patient.first_name} ${patient.last_name}`,
              age,
              diagnosis: patient.diagnosis,
              totalSessions: patientRecordings.length,
              recentSession,
              progressTrend,
              lastActivity: recentSession || patient.created_at
            };
          } catch (error) {
            console.error(`Error loading data for patient ${patient.id}:`, error);
            return {
              id: patient.id,
              name: `${patient.first_name} ${patient.last_name}`,
              age: undefined,
              diagnosis: patient.diagnosis,
              totalSessions: 0,
              recentSession: undefined,
              progressTrend: 'stable' as 'improving' | 'stable' | 'declining',
              lastActivity: patient.created_at
            };
          }
        });

        const stats = await Promise.all(patientStatsPromises);
        setPatientStats(stats);

        // Calculate overall summary metrics
        const totalRecordings = stats.reduce((sum, s) => sum + s.totalSessions, 0);

        setDashboardSummary({
          totalPatients: patientsData.length,
          activePatients: patientsData.filter(p => p.is_active).length,
          newPatientsThisMonth,
          totalSessions: totalRecordings,
          sessionsThisWeek: 0, // Would need more complex calculation
          upcomingEvaluations: 0 // Would need evaluation scheduling data
        });

      } catch (error) {
        console.error('Error loading patient data:', error);
      } finally {
        setLoadingPatients(false);
        hasLoadedData.current = true;
      }
    };

    // Only load data on initial mount or when user ID actually changes
    if (user?.id) {
      loadPatientData();
    }
    
    // Reset flag when user changes
    return () => {
      if (user?.id) {
        hasLoadedData.current = false;
      }
    };
  }, [user?.id]); // Only depend on user ID, not the whole user object

  return {
    patients,
    patientStats,
    dashboardSummary,
    loadingPatients
  };
};


