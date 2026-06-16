import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileAudio, 
  Plus,
  Users,
  Stethoscope
} from 'lucide-react';
import { Button } from '../../../ui/button';
import type { Patient } from '@/services/patientService';

interface QuickActionsProps {
  patients: Patient[];
  onCreateRecording: () => void;
  onUseSampleData: () => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ 
  patients, 
  onCreateRecording,
  onUseSampleData 
}) => {
  const navigate = useNavigate();

  return (
    <div className={`grid grid-cols-1 gap-4 mb-8 ${
      (!patients || patients.length === 0) 
        ? 'md:grid-cols-4' 
        : 'md:grid-cols-3'
    }`}>
      <Button
        onClick={() => navigate('/patients')}
        className="h-24 bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center justify-center gap-2"
      >
        <Users className="w-8 h-8" />
        <span className="text-lg font-medium">Manage Patients</span>
      </Button>
      
      <Button
        onClick={() => navigate('/patients/new')}
        className="h-24 bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-2"
      >
        <Plus className="w-8 h-8" />
        <span className="text-lg font-medium">Add New Patient</span>
      </Button>
      
      <Button
        onClick={onCreateRecording}
        variant="outline"
        className="h-24 border-2 hover:bg-gray-50 flex flex-col items-center justify-center gap-2"
      >
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <FileAudio className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-lg font-medium">New Recording</span>
      </Button>
      
      {/* Only show sample data if user has no patients */}
      {(!patients || patients.length === 0) && (
        <Button
          onClick={onUseSampleData}
          variant="outline"
          className="h-24 border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 flex flex-col items-center justify-center gap-2"
        >
          <Stethoscope className="w-8 h-8" />
          <span className="text-lg font-medium">Try Sample Data</span>
        </Button>
      )}
    </div>
  );
};

export default QuickActions;


