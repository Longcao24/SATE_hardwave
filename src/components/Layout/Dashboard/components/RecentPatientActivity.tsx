import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users,
  Calendar,
  UserCheck,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../../ui/button';
import type { PatientStats } from '../types';
import { formatDate, getProgressIcon } from '../utils';

interface RecentPatientActivityProps {
  patientStats: PatientStats[];
  timeFilter: 'all' | 'week' | 'month';
}

const RecentPatientActivity: React.FC<RecentPatientActivityProps> = ({ 
  patientStats,
  timeFilter
}) => {
  const navigate = useNavigate();

  // Filter patient activities by time
  const filteredPatientStats = patientStats.filter(stat => {
    if (timeFilter === 'all') return true;
    
    const lastActivityDate = new Date(stat.lastActivity);
    const now = new Date();
    const daysDiff = (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (timeFilter === 'week') return daysDiff <= 7;
    if (timeFilter === 'month') return daysDiff <= 30;
    return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Recent Patient Activity</h2>
      </div>
      
      {filteredPatientStats.length === 0 ? (
        <div className="p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No patient activity found</p>
          <Button onClick={() => navigate('/patients/new')} className="bg-blue-600 hover:bg-blue-700 text-white">
            Add Your First Patient
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {filteredPatientStats.slice(0, 10).map((patient) => (
            <div
              key={patient.id}
              className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate(`/patients/${patient.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    {patient.name}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    {patient.age && (
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-4 h-4" />
                        Age {patient.age}
                      </span>
                    )}
                    {patient.diagnosis && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-4 h-4" />
                        {patient.diagnosis}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {patient.totalSessions} recordings
                    </span>
                    {patient.recentSession && (
                      <span className="flex items-center gap-1">
                        Last recording: {formatDate(patient.recentSession)}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {getProgressIcon(patient.progressTrend)}
                      <span className={`text-sm font-medium capitalize ${
                        patient.progressTrend === 'improving' ? 'text-green-600' :
                        patient.progressTrend === 'stable' ? 'text-blue-600' :
                        'text-red-600'
                      }`}>
                        {patient.progressTrend}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Progress trend
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentPatientActivity;


