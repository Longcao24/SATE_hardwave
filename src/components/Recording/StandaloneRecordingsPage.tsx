import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useRecordings } from '@/hooks/useRecordings';
import { useDashboardData } from '@/components/Layout/Dashboard/hooks/useDashboardData';
import StandaloneRecordings from '@/components/Layout/Dashboard/components/StandaloneRecordings';
import { AssignPatientModal } from '@/components/Layout/LeftSidebar/modals/AssignPatientModal';
import { updateRecordingPatient } from '@/services/dataService';

/**
 * /recordings/standalone — every recording not assigned to a patient yet, newest first.
 * It used to be a second full list on the dashboard, right under Recent Recordings, and the two
 * overlapped; the dashboard now shows a button to this page instead.
 */
export default function StandaloneRecordingsPage() {
  const { user } = useAuth();
  const { recordings, isLoading } = useRecordings();
  const { patients, loadingPatients } = useDashboardData();
  const [assignRecordingId, setAssignRecordingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>
        {isLoading || loadingPatients ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <StandaloneRecordings
            mode="standalone"
            recordings={recordings}
            timeFilter="all"
            patients={patients}
            loadingPatients={loadingPatients}
            onAssignPatient={setAssignRecordingId}
          />
        )}
      </div>

      <AssignPatientModal
        isOpen={!!assignRecordingId}
        recordingId={assignRecordingId}
        recordings={recordings}
        patients={patients}
        loadingPatients={loadingPatients}
        onCancel={() => setAssignRecordingId(null)}
        onCreateNewPatient={() => { setAssignRecordingId(null); navigate('/patients/new'); }}
        onAssign={async (patientId) => {
          if (!assignRecordingId || !user) return;
          const result = await updateRecordingPatient(assignRecordingId, patientId, user.id);
          if (!result.success) {
            window.alert(`Could not assign the patient: ${result.error}`);
            return;
          }
          // The row leaves this list the moment this refetches, which is the feedback.
          queryClient.invalidateQueries({ queryKey: ['recordings', user.id] });
          setAssignRecordingId(null);
        }}
      />
    </div>
  );
}
