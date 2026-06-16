import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Activity, TrendingUp, BarChart3, ArrowRight } from 'lucide-react';
import { type Patient } from '@/services/patientService';
import { type RecordingStats } from '../types';
import { formatDate, formatDuration } from '../utils';

interface AnalyticsTabProps {
  patient: Patient;
  patientId?: string;
  recordingStats: RecordingStats[];
  loadingStats: boolean;
  timeFilter: 'all' | 'week' | 'month';
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  patient,
  patientId,
  recordingStats,
  loadingStats,
  timeFilter
}) => {
  const navigate = useNavigate();

  // Filter recordings by time
  const filteredStats = recordingStats.filter(stat => {
    if (timeFilter === 'all') return true;
    
    const recordingDate = new Date(stat.createdAt);
    const now = new Date();
    const daysDiff = (now.getTime() - recordingDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (timeFilter === 'week') return daysDiff <= 7;
    if (timeFilter === 'month') return daysDiff <= 30;
    return true;
  });

  const totalRecordings = filteredStats.length;
  const totalWords = filteredStats.reduce((sum, stat) => sum + stat.totalWords, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Speech Progress Analytics</h3>
          <p className="text-gray-600">Track improvement trends for {patient?.first_name} {patient?.last_name}</p>
        </div>
      </div>

      {loadingStats ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      ) : filteredStats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data for Analysis</h3>
          <p className="text-gray-500 mb-6">This patient needs at least one recording to show progress trends.</p>
          <Button 
            onClick={() => navigate(`/record?patientId=${patientId}`)} 
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Create First Recording
          </Button>
        </div>
      ) : (
        <>
          {/* Progress Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Error Rate Trend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Error Rate Trend</h3>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  filteredStats.length > 1 && filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                    ? 'bg-green-100 text-green-700'
                    : filteredStats.length > 1 && filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {filteredStats.length > 1 ? (
                    filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate ? '↗ Improving' :
                    filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate ? '↘ Needs Attention' :
                    '→ Stable'
                  ) : 'Baseline'}
                </div>
              </div>
              
              <div className="space-y-3">
                {filteredStats.slice().reverse().map((stat) => (
                  <div key={stat.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{stat.fileName}</p>
                        <p className="text-xs text-gray-500">{formatDate(stat.createdAt)}</p>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${
                      stat.errorRate < 5 ? 'text-green-600' : 
                      stat.errorRate < 10 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {stat.errorRate.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Word Count Progress */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Session Length Trend</h3>
                <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  Avg: {Math.round(totalWords / totalRecordings)} words
                </div>
              </div>
              
              <div className="space-y-3">
                {filteredStats.slice().reverse().map((stat) => (
                  <div key={stat.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{stat.fileName}</p>
                        <p className="text-xs text-gray-500">{formatDuration(stat.duration)}</p>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700">
                      {stat.totalWords} words
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Improvement Insights */}
          {filteredStats.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">First Session</span>
                  </div>
                  <div className="text-lg font-bold text-blue-900">
                    {filteredStats[filteredStats.length - 1].errorRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-blue-700">Error Rate</p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Activity className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Latest Session</span>
                  </div>
                  <div className="text-lg font-bold text-green-900">
                    {filteredStats[0].errorRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-green-700">Error Rate</p>
                </div>
                
                <div className={`p-4 rounded-lg ${
                  filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                    ? 'bg-green-50'
                    : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp className={`w-4 h-4 ${
                      filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                        ? 'text-green-600'
                        : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                        ? 'text-green-900'
                        : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                        ? 'text-red-900'
                        : 'text-gray-900'
                    }`}>Change</span>
                  </div>
                  <div className={`text-lg font-bold ${
                    filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                      ? 'text-green-900'
                      : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                      ? 'text-red-900'
                      : 'text-gray-900'
                  }`}>
                    {filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate ? '-' : '+'}
                    {Math.abs(filteredStats[0].errorRate - filteredStats[filteredStats.length - 1].errorRate).toFixed(1)}%
                  </div>
                  <p className={`text-xs ${
                    filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                      ? 'text-green-700'
                      : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                      ? 'text-red-700'
                      : 'text-gray-700'
                  }`}>
                    {filteredStats[0].errorRate < filteredStats[filteredStats.length - 1].errorRate
                      ? 'Improvement'
                      : filteredStats[0].errorRate > filteredStats[filteredStats.length - 1].errorRate
                      ? 'Regression'
                      : 'No Change'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* All Recordings Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">All Recording Sessions</h2>
              <p className="text-sm text-gray-600 mt-1">Click any session to view detailed analysis</p>
            </div>
            
            <div className="divide-y divide-gray-200">
              {filteredStats.map((stat, statIndex) => (
                <div
                  key={stat.id}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/report/${stat.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Session #{filteredStats.length - statIndex}
                        </span>
                        <h3 className="text-lg font-medium text-gray-900">
                          {stat.fileName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(stat.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDuration(stat.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-4 h-4" />
                          {stat.totalWords} words
                        </span>
                        <span className="flex items-center gap-1">
                          {stat.speakers.length} speaker{stat.speakers.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${
                          stat.errorRate < 5 ? 'text-green-600' : 
                          stat.errorRate < 10 ? 'text-yellow-600' : 
                          'text-red-600'
                        }`}>
                          {stat.errorRate.toFixed(1)}%
                        </div>
                        <p className="text-xs text-gray-500">error rate</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

