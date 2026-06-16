import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useRecordings } from '@/hooks/useRecordings';
import CreateRecordingPopup from '../../Recording/CreateRecordingPopup';
import FirstTimeGuide from '../../Common/FirstTimeGuide';
import ImportPopup from '../../Modals/ImportPopup';

// Import Dashboard components
import DashboardHeader from './components/DashboardHeader';
import QuickActions from './components/QuickActions';
import StatsCards from './components/StatsCards';
import RecentPatientActivity from './components/RecentPatientActivity';
import StandaloneRecordings from './components/StandaloneRecordings';
import DeviceOverview from './components/DeviceOverview';

// Import custom hook
import { useDashboardData } from './hooks/useDashboardData';

// Import types
import type { DashboardProps } from './types';

const Dashboard: React.FC<DashboardProps> = ({ onImport, onUseSampleData }) => {
  const { user, hasSeenGuide, markGuideAsSeen } = useAuth();
  const { recordings, isLoading } = useRecordings();
  const { patients, patientStats, dashboardSummary, loadingPatients } = useDashboardData();
  
  const [timeFilter] = useState<'all' | 'week' | 'month'>('all');
  const [showCreateRecordingPopup, setShowCreateRecordingPopup] = useState(false);
  const [showFirstTimeGuide, setShowFirstTimeGuide] = useState(false);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [importPatientId, setImportPatientId] = useState<string | undefined>(undefined);

  // Show first-time guide for new users
  useEffect(() => {
    if (!isLoading && !loadingPatients && user && !hasSeenGuide) {
      // Show guide if user hasn't seen it and has no patients
      const shouldShowGuide = !patients || patients.length === 0;
      setShowFirstTimeGuide(shouldShowGuide);
    }
  }, [isLoading, loadingPatients, user, hasSeenGuide, patients]);

  const handleGuideClose = () => {
    setShowFirstTimeGuide(false);
    // Only mark as seen if it was automatically shown (not manually opened)
    if (!hasSeenGuide) {
      markGuideAsSeen();
    }
  };

  // Handle import flow from CreateRecordingPopup
  const handleImportFromCreate = (patientId?: string) => {
    // Close CreateRecordingPopup and open ImportPopup
    setShowCreateRecordingPopup(false);
    setImportPatientId(patientId);
    setShowImportPopup(true);
  };

  // Handle file upload from ImportPopup
  const handleFileUpload = (file: File, patientId?: string) => {
    onImport(file, patientId);
  };

  if (isLoading || loadingPatients) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-auto">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <DashboardHeader onShowGuide={() => setShowFirstTimeGuide(true)} />

        {/* Quick Actions */}
        <QuickActions
          patients={patients}
          onCreateRecording={() => setShowCreateRecordingPopup(true)}
          onUseSampleData={onUseSampleData}
        />

        {/* Devices Overview */}
        <DeviceOverview />

        {/* Time Filter */}
        {/* <div className="flex items-center gap-2 mb-6">
          <Filter className="w-4 h-4 text-gray-500" />
          <div className="flex gap-2">
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                timeFilter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                timeFilter === 'month' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                timeFilter === 'week' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Last 7 Days
            </button>
          </div>
        </div> */}

        {/* Clinical Overview Stats */}
        <StatsCards dashboardSummary={dashboardSummary} />

        {/* Quick Recording */}
        {/* <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Quick Recording</h2>
            <p className="text-sm text-gray-600 mt-1">Start a new recording session</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> */}
              {/* Recording with Existing Patient */}
              {/* <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Record with Patient</h3>
                    <p className="text-sm text-gray-600">Click patient name to view details and start recording</p>
                  </div>
                </div>
                
                {patients && patients.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {patients.slice(0, 5).map((patient) => (
                      <button
                        key={patient.id}
                        onClick={() => {
                          // Navigate to patient detail page
                          navigate(`/patients/${patient.id}`);
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {patient.first_name} {patient.last_name}
                            </p>
                            {patient.diagnosis && (
                              <p className="text-xs text-gray-600">{patient.diagnosis}</p>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </button>
                    ))}
                    {patients.length > 5 && (
                      <button
                        onClick={() => navigate('/patients')}
                        className="w-full p-2 text-sm text-blue-600 hover:text-blue-700 text-center"
                      >
                        View all {patients.length} patients
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-3">No patients added yet</p>
                    <Button
                      onClick={() => navigate('/patients/new')}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Add First Patient
                    </Button>
                  </div>
                )}
              </div> */}

              {/* One-time Recording */}
              {/* <div className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">One-time Recording</h3>
                    <p className="text-sm text-gray-600">Quick recording without patient profile</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      setImportPatientId(undefined);
                      setShowImportPopup(true);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                  >
                    <FileAudio className="w-4 h-4" />
                    Import Audio File
                  </Button>
                  
                  <Button
                    onClick={() => onRecord()}
                    variant="outline"
                    className="w-full border-green-200 text-green-700 hover:bg-green-50 flex items-center justify-center gap-2"
                  >
                    <div className="w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                    Start Recording
                  </Button> */}
                  
                  {/* <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600 text-center">
                      Perfect for demonstrations, practice sessions, or temporary recordings
                    </p>
                  </div> */}
                {/* </div> */}
              {/* // </div> */}
            {/* // </div> */}
          {/* </div> */}
        {/* </div> */}

        {/* Recent Patient Activity */}
        <RecentPatientActivity 
          patientStats={patientStats}
          timeFilter={timeFilter}
        />

        {/* Standalone Recordings (No Patient) */}
        <StandaloneRecordings 
          recordings={recordings}
          timeFilter={timeFilter}
        />
      </div>

      {/* Create Recording Popup */}
      <CreateRecordingPopup
        isOpen={showCreateRecordingPopup}
        onClose={() => setShowCreateRecordingPopup(false)}
        onImportAudio={handleImportFromCreate}
      />

      {/* First Time Guide */}
      <FirstTimeGuide
        isOpen={showFirstTimeGuide}
        onClose={handleGuideClose}
        onImportAudio={handleImportFromCreate}
        onTrySample={onUseSampleData}
      />

      {/* Import Popup */}
      <ImportPopup
        isOpen={showImportPopup}
        onClose={() => {
          setShowImportPopup(false);
          setImportPatientId(undefined);
        }}
        onFileUpload={handleFileUpload}
        preSelectedPatientId={importPatientId}
        onBack={() => {
          setShowImportPopup(false);
          setShowCreateRecordingPopup(true);
        }}
      />
    </div>
  );
};

export default Dashboard;


