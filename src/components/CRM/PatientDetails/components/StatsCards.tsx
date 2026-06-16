import { FileAudio, Clock, Activity, AlertTriangle } from 'lucide-react';
import { type RecordingStats } from '../types';
import { formatDuration } from '../utils';

interface StatsCardsProps {
  recordingStats: RecordingStats[];
  loadingStats: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ recordingStats, loadingStats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileAudio className="w-6 h-6 text-blue-600" />
          </div>
          <span className="text-sm text-gray-500">Total</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{recordingStats.length}</div>
        <p className="text-sm text-gray-600 mt-1">Recordings</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <Clock className="w-6 h-6 text-green-600" />
          </div>
          <span className="text-sm text-gray-500">Duration</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {loadingStats ? '--' : formatDuration(recordingStats.reduce((sum, stat) => sum + stat.duration, 0))}
        </div>
        <p className="text-sm text-gray-600 mt-1">Total Time</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Activity className="w-6 h-6 text-purple-600" />
          </div>
          <span className="text-sm text-gray-500">Analyzed</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {loadingStats ? '--' : recordingStats.reduce((sum, stat) => sum + stat.totalWords, 0).toLocaleString()}
        </div>
        <p className="text-sm text-gray-600 mt-1">Total Words</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <span className="text-sm text-gray-500">Quality</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {loadingStats ? '--' : 
            recordingStats.length > 0 ? 
              ((recordingStats.reduce((sum, stat) => sum + stat.totalIssues, 0) / 
                recordingStats.reduce((sum, stat) => sum + stat.totalWords, 0)) * 100).toFixed(1) + '%' 
              : '0.0%'
          }
        </div>
        <p className="text-sm text-gray-600 mt-1">Avg Error Rate</p>
      </div>
    </div>
  );
};

