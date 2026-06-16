import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileAudio, 
  Calendar,
  ArrowRight
} from 'lucide-react';
import type { TimeFilter } from '../types';
import { formatDate } from '../utils';

interface Recording {
  id: string;
  recording_name?: string;
  file_name: string;
  created_at: string;
  patient_id?: string;
}

interface StandaloneRecordingsProps {
  recordings: Recording[] | undefined;
  timeFilter: TimeFilter;
}

const StandaloneRecordings: React.FC<StandaloneRecordingsProps> = ({ 
  recordings,
  timeFilter
}) => {
  const navigate = useNavigate();

  const truncateFileName = (fileName: string, maxLength: number = 60) => {
    if (fileName.length <= maxLength) return fileName;
    
    const extension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
    const nameWithoutExt = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3);
    
    return `${truncatedName}...${extension}`;
  };

  const standaloneRecordings = recordings?.filter(recording => !recording.patient_id) || [];
  const filteredStandaloneRecordings = standaloneRecordings.filter(recording => {
    if (timeFilter === 'all') return true;
    
    const recordingDate = new Date(recording.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - recordingDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (timeFilter === 'week') return daysDiff <= 7;
    if (timeFilter === 'month') return daysDiff <= 30;
    return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-8">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Standalone Recordings</h2>
        <p className="text-sm text-gray-600 mt-1">Recordings not linked to any patient</p>
      </div>
      
      {filteredStandaloneRecordings.length === 0 ? (
        <div className="p-12 text-center">
          <FileAudio className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No standalone recordings found</p>
          <p className="text-sm text-gray-400">Create one-time recordings that don't require patient profiles</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {filteredStandaloneRecordings.slice(0, 10).map((recording) => (
            <div
              key={recording.id}
              className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate(`/report/${recording.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-gray-900 mb-1 truncate" title={recording.recording_name || recording.file_name}>
                    {truncateFileName(recording.recording_name || recording.file_name, 60)}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(recording.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileAudio className="w-4 h-4" />
                      Standalone recording
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      No Patient
                    </div>
                    <p className="text-xs text-gray-500 mt-1">One-time recording</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
          
          {filteredStandaloneRecordings.length > 10 && (
            <div className="p-4 text-center border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing 10 of {filteredStandaloneRecordings.length} standalone recordings
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StandaloneRecordings;


