import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileAudio, Clock, Activity, AlertTriangle, BarChart3, Eye, Trash2, UserX, UserCheck } from 'lucide-react';
import { type Patient } from '@/services/patientService';
import { type RecordingStats } from '../types';
import { formatDate, formatDuration } from '../utils';

interface ReportsTabProps {
  patient: Patient;
  recordingStats: RecordingStats[];
  loadingStats: boolean;
  onAddRecording: () => void;
  onDeleteClick: (recordingId: string) => void;
  onMoveToStandalone?: (recordingId: string) => void;
  onChangePatient?: (recordingId: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  patient,
  recordingStats,
  loadingStats,
  onAddRecording,
  onDeleteClick,
  onMoveToStandalone,
  onChangePatient
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Recording Reports</h3>
          <p className="text-gray-600">View analysis reports for {patient?.first_name} {patient?.last_name}'s recordings</p>
        </div>
        <Button
          onClick={onAddRecording}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Recording
        </Button>
      </div>

      {/* Recording Reports */}
      <Card className="bg-white shadow-sm border-0">
        <div className="p-6 border-b border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900">Analysis Reports</h4>
          <p className="text-sm text-gray-600 mt-1">Each recording generates a detailed analysis report</p>
        </div>

        {loadingStats ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading recording reports...</p>
          </div>
        ) : recordingStats.length === 0 ? (
          <div className="p-8 text-center">
            <FileAudio className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h5 className="text-lg font-medium text-gray-900 mb-2">No Recording Reports</h5>
            <p className="text-gray-500 mb-4">Add a recording to generate your first analysis report</p>
            <Button 
              onClick={onAddRecording}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Recording
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {recordingStats.map((stat) => (
              <div key={stat.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Badge className="bg-blue-100 text-blue-700">
                        Analysis Report
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {formatDate(stat.createdAt)}
                      </span>
                    </div>
                    <h5 className="font-medium text-gray-900 mb-2">{stat.fileName}</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{formatDuration(stat.duration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{stat.totalWords} words</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{stat.totalIssues} issues</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-400" />
                        <span className={`font-medium ${
                          stat.errorRate < 5 ? 'text-green-600' : 
                          stat.errorRate < 10 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {stat.errorRate.toFixed(1)}% error rate
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      <span className="font-medium">Speakers:</span> {stat.speakers.join(', ')}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      onClick={() => navigate(`/report/${stat.id}`)}
                      variant="outline"
                      size="sm"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Report
                    </Button>
                    {onChangePatient && (
                      <Button
                        onClick={() => onChangePatient(stat.id)}
                        variant="outline"
                        size="sm"
                        className="text-green-600 border-green-200 hover:bg-green-50"
                        title="Change patient assignment"
                      >
                        <UserCheck className="w-4 h-4 mr-1" />
                        Change Patient
                      </Button>
                    )}
                    {onMoveToStandalone && (
                      <Button
                        onClick={() => onMoveToStandalone(stat.id)}
                        variant="outline"
                        size="sm"
                        className="text-orange-600 border-orange-200 hover:bg-orange-50"
                        title="Move to standalone recordings"
                      >
                        <UserX className="w-4 h-4 mr-1" />
                        Move to Standalone
                      </Button>
                    )}
                    <Button
                      onClick={() => onDeleteClick(stat.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

