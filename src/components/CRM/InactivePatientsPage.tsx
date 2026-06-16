import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Patient, patientService } from '@/services/patientService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  UserX, 
  Search, 
 
  Phone, 
  Mail, 
  ArrowLeft, 
  Home, 
  Users,
  UserCheck,
  RotateCcw,
  Eye,
  AlertCircle
} from 'lucide-react';

const InactivePatientsPage: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reactivating, setReactivating] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadInactivePatients();
  }, []);

  const loadInactivePatients = async () => {
    try {
      setLoading(true);
      const data = await patientService.getInactivePatients();
      setPatients(data);
    } catch (error) {
      console.error('Failed to load inactive patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivatePatient = async (patientId: string) => {
    try {
      setReactivating(patientId);
      await patientService.updatePatient(patientId, { is_active: true });
      
      // Remove patient from the list since they're now active
      setPatients(prev => prev.filter(p => p.id !== patientId));
    } catch (error) {
      console.error('Failed to reactivate patient:', error);
    } finally {
      setReactivating(null);
    }
  };

  const handlePatientClick = (patient: Patient) => {
    navigate(`/patients/${patient.id}`);
  };

  const filteredPatients = patients.filter(patient => {
    const searchLower = searchTerm.toLowerCase();
    return (
      patient.first_name.toLowerCase().includes(searchLower) ||
      patient.last_name.toLowerCase().includes(searchLower) ||
      (patient.diagnosis && patient.diagnosis.toLowerCase().includes(searchLower))
    );
  });

  const getAge = (dateOfBirth?: string) => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-gray-500">Loading inactive patients...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <Button
              variant="outline"
              onClick={() => navigate('/patients')}
              className="text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Active Patients
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
          
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <UserX className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Inactive Patients</h1>
                  <p className="text-gray-600">View and manage inactive patient profiles</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-white shadow-sm border-0 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <UserX className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Inactive Patients</p>
                <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-white shadow-sm border-0 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900">
                  {searchTerm ? filteredPatients.length : patients.length}
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-white shadow-sm border-0 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Can Reactivate</p>
                <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="p-6 mb-8 bg-white shadow-sm border-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search inactive patients by name or diagnosis..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
            />
          </div>
        </Card>

        {/* Patients Grid */}
        {filteredPatients.length === 0 ? (
          <Card className="p-12 text-center bg-white shadow-sm border-0">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserX className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No inactive patients found' : 'No inactive patients'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms to find what you\'re looking for.' 
                : 'All patients are currently active. Inactive patients will appear here when they are deactivated.'
              }
            </p>
            {!searchTerm && (
              <Button
                onClick={() => navigate('/patients')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Users className="w-4 h-4 mr-2" />
                View Active Patients
              </Button>
            )}
          </Card>
        ) : (
          <>
            {/* Info Banner */}
            <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <span className="font-medium">Note:</span> Inactive patients are hidden from the main patient list and search results. 
                  You can reactivate them here or view their details by clicking on them.
                </div>
              </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredPatients.map((patient) => (
                <Card
                  key={patient.id}
                  className="p-6 bg-white shadow-sm border-0 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                  onClick={() => handlePatientClick(patient)}
                >
                  <div className="space-y-4">
                    {/* Patient Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                          {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                            {patient.first_name} {patient.last_name}
                          </h3>
                          {patient.date_of_birth && (
                            <p className="text-sm text-gray-500">
                              Age: {getAge(patient.date_of_birth)} years
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <Badge className="text-xs bg-red-100 text-red-700 border-red-200">
                          Inactive
                        </Badge>
                        {patient.gender && (
                          <Badge variant="secondary" className="text-xs">
                            {patient.gender === 'male' ? 'M' : 
                             patient.gender === 'female' ? 'F' : 
                             patient.gender === 'other' ? 'O' : 'N/A'}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Patient Info */}
                    <div className="space-y-2">
                      {patient.diagnosis && (
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                          <p className="text-sm text-gray-700 font-medium">
                            {patient.diagnosis}
                          </p>
                        </div>
                      )}
                      
                      {patient.contact_email && (
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Mail className="w-4 h-4" />
                          <p className="text-sm truncate">{patient.contact_email}</p>
                        </div>
                      )}
                      
                      {patient.contact_phone && (
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Phone className="w-4 h-4" />
                          <p className="text-sm">{patient.contact_phone}</p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        Inactive since {new Date(patient.updated_at).toLocaleDateString()}
                      </span>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePatientClick(patient);
                          }}
                          className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReactivatePatient(patient.id);
                          }}
                          disabled={reactivating === patient.id}
                          className="text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
                        >
                          {reactivating === patient.id ? (
                            <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          {reactivating === patient.id ? 'Activating...' : 'Reactivate'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InactivePatientsPage;
