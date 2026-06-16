import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Calendar, 
  Phone, 
  Mail, 
  Edit, 
  Plus, 
  FileText, 
  Activity,
  Home
} from 'lucide-react';
import { type Patient } from '@/services/patientService';
import { getAge } from '../utils';

interface PatientHeaderProps {
  patient: Patient;
  onNewRecording: () => void;
}

export const PatientHeader: React.FC<PatientHeaderProps> = ({ patient, onNewRecording }) => {
  const navigate = useNavigate();

  return (
    <div className="mb-8">
      <div className="flex items-center space-x-2 mb-4">
        <Button
          variant="outline"
          onClick={() => navigate('/patients')}
          className="text-gray-600 border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Patients
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/')}
          className="text-gray-600 border-gray-200 hover:bg-gray-50"
        >
          <Home className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
      </div>
      
      <Card className="p-6 bg-white shadow-sm border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between">
          <div className="flex items-center space-x-4 mb-4 md:mb-0">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
              {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {patient.first_name} {patient.last_name}
              </h1>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                {patient.date_of_birth && (
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-4 h-4" />
                    <span>Age: {getAge(patient.date_of_birth)} years</span>
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <Activity className="w-4 h-4" />
                  <Badge 
                    className={`text-xs ${patient.is_active 
                      ? 'bg-green-100 text-green-700 border-green-200' 
                      : 'bg-red-100 text-red-700 border-red-200'
                    }`}
                  >
                    {patient.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {patient.diagnosis && (
                  <div className="flex items-center space-x-1">
                    <FileText className="w-4 h-4" />
                    <span>{patient.diagnosis}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                {patient.contact_email && (
                  <div className="flex items-center space-x-1">
                    <Mail className="w-4 h-4" />
                    <span>{patient.contact_email}</span>
                  </div>
                )}
                {patient.contact_phone && (
                  <div className="flex items-center space-x-1">
                    <Phone className="w-4 h-4" />
                    <span>{patient.contact_phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/patients/${patient.id}/edit`)}
              className="text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Patient
            </Button>
            <Button
              onClick={onNewRecording}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Recording
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

