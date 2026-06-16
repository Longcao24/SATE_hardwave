import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Activity, Plus, FileAudio, ArrowRight } from 'lucide-react';
import { type Patient } from '@/services/patientService';
import { type RecordingStats } from '../types';
import { getAge, formatDate, formatDuration } from '../utils';

interface OverviewTabProps {
  patient: Patient;
  recordingStats: RecordingStats[];
  loadingStats: boolean;
  onAddRecording: () => void;
  onViewAllReports: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  patient,
  recordingStats,
  loadingStats,
  onAddRecording,
  onViewAllReports
}) => {
  const navigate = useNavigate();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Patient Information</h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-sm text-gray-600">Full Name</dt>
            <dd className="font-medium">{patient.first_name} {patient.last_name}</dd>
          </div>
          {patient.date_of_birth && (
            <div>
              <dt className="text-sm text-gray-600">Date of Birth</dt>
              <dd className="font-medium">
                {new Date(patient.date_of_birth).toLocaleDateString()} (Age: {getAge(patient.date_of_birth)})
              </dd>
            </div>
          )}
          {patient.gender && (
            <div>
              <dt className="text-sm text-gray-600">Gender</dt>
              <dd className="font-medium capitalize">{patient.gender.replace('_', ' ')}</dd>
            </div>
          )}
          {patient.diagnosis && (
            <div>
              <dt className="text-sm text-gray-600">Diagnosis</dt>
              <dd className="font-medium">{patient.diagnosis}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-gray-600">Status</dt>
            <dd className="font-medium">
              <Badge 
                className={`text-sm ${patient.is_active 
                  ? 'bg-green-100 text-green-700 border-green-200' 
                  : 'bg-red-100 text-red-700 border-red-200'
                }`}
              >
                {patient.is_active ? 'Active Patient' : 'Inactive Patient'}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Contact Information</h3>
        <dl className="space-y-2">
          {patient.contact_email && (
            <div>
              <dt className="text-sm text-gray-600">Email</dt>
              <dd className="font-medium">{patient.contact_email}</dd>
            </div>
          )}
          {patient.contact_phone && (
            <div>
              <dt className="text-sm text-gray-600">Phone</dt>
              <dd className="font-medium">{patient.contact_phone}</dd>
            </div>
          )}
          {patient.guardian_name && (
            <div>
              <dt className="text-sm text-gray-600">Guardian</dt>
              <dd className="font-medium">{patient.guardian_name}</dd>
            </div>
          )}
          {patient.guardian_phone && (
            <div>
              <dt className="text-sm text-gray-600">Guardian Phone</dt>
              <dd className="font-medium">{patient.guardian_phone}</dd>
            </div>
          )}
        </dl>
      </Card>

      {patient.notes && (
        <Card className="p-6 md:col-span-2">
          <h3 className="font-semibold mb-4">Notes</h3>
          <p className="whitespace-pre-wrap">{patient.notes}</p>
        </Card>
      )}

      {/* Recent Reports Section */}
      <Card className="p-6 md:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent Reports</h3>
          <Button
            onClick={onAddRecording}
            variant="outline"
            size="sm"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Recording
          </Button>
        </div>
        
        {loadingStats ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : recordingStats.length === 0 ? (
          <div className="text-center py-8">
            <FileAudio className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No recordings yet</p>
            <p className="text-xs text-gray-400 mt-1">Upload or record audio to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recordingStats.slice(0, 3).map((stat) => (
              <div
                key={stat.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                onClick={() => navigate(`/report/${stat.id}`)}
              >
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 text-sm">{stat.fileName}</h4>
                  <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(stat.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(stat.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {stat.totalWords} words
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${
                    stat.errorRate < 5 ? 'text-green-600' : 
                    stat.errorRate < 10 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {stat.errorRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">error rate</p>
                </div>
              </div>
            ))}
            
            {recordingStats.length > 3 && (
              <div className="text-center pt-2">
                <Button
                  onClick={onViewAllReports}
                  variant="outline"
                  size="sm"
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  View All {recordingStats.length} Reports
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

