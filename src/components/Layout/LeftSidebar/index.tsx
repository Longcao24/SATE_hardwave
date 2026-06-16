import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecordings, type Recording } from '@/hooks/useRecordings';
import { getRecordingUrl } from '@/services/dataService';
import { useAuth } from '@/contexts/AuthProvider';
import { patientService, type Patient } from '@/services/patientService';
import { useStripe } from '@/contexts/StripeProvider';
import { UserSettingsModal } from '@/components/Profile/UserSettingsModal';

// Hooks
import { usePatientContext } from './hooks/usePatientContext';
import { useDeleteRecording } from './hooks/useDeleteRecording';
import { useRecordingActions } from './hooks/useRecordingActions';

// Components
import { SidebarHeader } from './components/SidebarHeader';
import { CollapsedSidebar } from './components/CollapsedSidebar';
import { UserProfile } from './components/UserProfile';
import { ActionButtons } from './components/ActionButtons';
import { PatientSection } from './components/PatientSection';
import { RecordingsList } from './components/RecordingsList';
import { SidebarFooter } from './components/SidebarFooter';
import { CollapsedUserProfileDropdown } from './components/CollapsedUserProfileDropdown';
import { ToastNotification } from './components/ToastNotification';

// Modals
import { DeleteRecordingModal } from './modals/DeleteRecordingModal';
import { RenameRecordingModal } from './modals/RenameRecordingModal';
import { AssignPatientModal } from './modals/AssignPatientModal';
import { MoveToStandaloneModal } from './modals/MoveToStandaloneModal';
import CreateRecordingPopup from '@/components/Recording/CreateRecordingPopup';
import ImportPopup from '@/components/Modals/ImportPopup';

interface LeftSidebarProps {
  visible: boolean;
  collapsed?: boolean;
  onToggle: () => void;
  onLogout?: () => void;
  onSelectRecording?: (audioUrl: string, recordingId: string) => void;
  onNavigate?: (path: string) => void;
  width?: number;
  onFileUpload?: (file: File, patientId?: string) => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ 
  visible, 
  collapsed = false,
  onToggle,
  onLogout,
  onSelectRecording,
  onNavigate,
  width = 320,
  onFileUpload
}) => {
  const collapsedWidth = 70;
  const actualWidth = collapsed ? collapsedWidth : width;
  
  // Hooks
  const { recordings, isLoading: recLoading, error: recError } = useRecordings();
  const { user } = useAuth();
  const { currentTier, isLoading: subscriptionLoading } = useStripe();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { currentPatient, contextPatientId } = usePatientContext();
  const { deleteConfirm, isDeleting, toast, handleDeleteClick, handleDeleteConfirm, handleDeleteCancel } = useDeleteRecording();
  
  // Local state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<'profile' | 'subscription' | 'billing' | 'security' | 'notifications' | 'inviteCodes'>('profile');
  const [openMenuRecordingId, setOpenMenuRecordingId] = useState<string | null>(null);
  const [selectedFilterPatientId, setSelectedFilterPatientId] = useState<string | null>(null);
  const [showCreateRecordingPopup, setShowCreateRecordingPopup] = useState(false);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [importPatientId, setImportPatientId] = useState<string | undefined>(undefined);
  
  const recordingActions = useRecordingActions(patients);
  
  // Navigation handler
  const handleNavigate = useCallback((path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      navigate(path);
    }
  }, [onNavigate, navigate]);
  
  // Utility functions
  const truncateFileName = useCallback((fileName: string, maxLength: number = 10) => {
    if (fileName.length <= maxLength) return fileName;
    return `${fileName.substring(0, 15)}....`;
  }, []);
  
  // Filter recordings based on context or selected filter
  const filteredRecordings = useMemo(() => {
    if (!recordings) return recordings;
    
    // First priority: if we're on a patient detail page, show that patient's recordings
    if (contextPatientId) {
      return recordings.filter(r => r.patient_id === contextPatientId);
    }
    
    // Second priority: if user has selected a patient filter in sidebar
    if (selectedFilterPatientId) {
      return recordings.filter(r => r.patient_id === selectedFilterPatientId);
    }
    
    // Default: show all recordings
    return recordings;
  }, [recordings, contextPatientId, selectedFilterPatientId]);
  
  // Load patients
  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoadingPatients(true);
        const data = await patientService.getPatients();
        setPatients(data);
      } catch (error) {
        console.error('Failed to load patients:', error);
      } finally {
        setLoadingPatients(false);
      }
    };
    loadPatients();
  }, []);
  
  // Close user profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserProfile) {
        const target = event.target as HTMLElement;
        const profileButton = target.closest('[data-profile-button]');
        const profileDropdown = target.closest('[data-profile-dropdown]');
        if (!profileButton && !profileDropdown) {
          setShowUserProfile(false);
        }
      }
    };

    if (showUserProfile) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserProfile]);
  
  // Close recording menu dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuRecordingId) {
        const target = event.target as HTMLElement;
        const menuButton = target.closest('[data-recording-menu-button]');
        const menuDropdown = target.closest('[data-recording-menu-dropdown]');
        if (!menuButton && !menuDropdown) {
          setOpenMenuRecordingId(null);
        }
      }
    };

    if (openMenuRecordingId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuRecordingId]);
  
  // Handlers
  const handleMenuToggle = useCallback((recordingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuRecordingId(openMenuRecordingId === recordingId ? null : recordingId);
  }, [openMenuRecordingId]);
  
  const handleRecordingClick = useCallback(async (recording: Recording) => {
    if (!onSelectRecording) return;
    const url = await getRecordingUrl(recording.file_path);
    if (url) {
      onSelectRecording(url, recording.id);
    }
  }, [onSelectRecording]);
  
  const handleSettingsClick = useCallback((section: 'profile' | 'billing' | 'inviteCodes') => {
    setShowUserProfile(false);
    setSettingsInitialSection(section);
    setShowSettingsModal(true);
  }, []);
  
  const handleRenameClick = useCallback((recording: Recording, e: React.MouseEvent) => {
    recordingActions.handleRenameClick(recording, e);
    setOpenMenuRecordingId(null);
  }, [recordingActions]);
  
  const handleAssignPatientClick = useCallback((recordingId: string, e: React.MouseEvent) => {
    recordingActions.handleAssignPatientClick(recordingId, e);
    setOpenMenuRecordingId(null);
  }, [recordingActions]);
  
  const handleMoveToStandaloneClick = useCallback((recording: Recording, e: React.MouseEvent) => {
    recordingActions.handleMoveToStandaloneClick(recording, e);
    setOpenMenuRecordingId(null);
  }, [recordingActions]);
  
  const handleLogout = useCallback(() => {
    setShowUserProfile(false);
    if (onLogout) {
      onLogout();
    }
  }, [onLogout]);
  
  // Patient filter handlers
  const handlePatientFilterClick = useCallback((patientId: string) => {
    // Toggle filter: if same patient is clicked, clear filter
    if (selectedFilterPatientId === patientId) {
      setSelectedFilterPatientId(null);
    } else {
      setSelectedFilterPatientId(patientId);
    }
  }, [selectedFilterPatientId]);
  
  const handleClearPatientFilter = useCallback(() => {
    setSelectedFilterPatientId(null);
  }, []);
  
  // Clear patient filter when navigating to a patient detail page
  useEffect(() => {
    if (contextPatientId) {
      setSelectedFilterPatientId(null);
    }
  }, [contextPatientId]);
  
  // Handle recording creation flow
  const handleCreateRecording = useCallback(() => {
    setShowCreateRecordingPopup(true);
  }, []);
  
  const handleImportFromCreate = useCallback((patientId?: string) => {
    setShowCreateRecordingPopup(false);
    setImportPatientId(patientId);
    setShowImportPopup(true);
  }, []);
  
  const handleFileUpload = useCallback((file: File, patientId?: string) => {
    setShowImportPopup(false);
    // Trigger import in parent component (MainApp)
    if (onFileUpload) {
      onFileUpload(file, patientId);
    }
  }, [onFileUpload]);
  
  return (
    <>
      <div 
        style={{ width: `${actualWidth}px` }}
        className={`bg-gray-50 border-r border-gray-200 flex flex-col h-full transition-all duration-200 overflow-hidden ${
          visible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarHeader 
          collapsed={collapsed} 
          onToggle={onToggle} 
          onNavigate={handleNavigate}
          width={width}
        />
        
        {collapsed ? (
          <CollapsedSidebar
            onToggle={onToggle}
            onNavigate={handleNavigate}
            onProfileClick={() => setShowUserProfile(!showUserProfile)}
            hasUser={!!user}
          />
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {onLogout && user && (
              <UserProfile
                user={user}
                currentTier={currentTier}
                subscriptionLoading={subscriptionLoading}
                showUserProfile={showUserProfile}
                onToggleProfile={() => setShowUserProfile(!showUserProfile)}
                onSettingsClick={handleSettingsClick}
                onUpgradeClick={() => handleNavigate('/pricing')}
                onLogout={handleLogout}
              />
            )}
            
            <ActionButtons 
              showDashboardButton={location.pathname !== '/'} 
              onNavigate={handleNavigate}
            />
            
            <PatientSection
              currentPatient={currentPatient}
              patients={patients}
              loadingPatients={loadingPatients}
              selectedFilterPatientId={selectedFilterPatientId}
              onNavigate={handleNavigate}
              onPatientClick={handlePatientFilterClick}
              onClearFilter={handleClearPatientFilter}
            />
            
            <RecordingsList
              recordings={filteredRecordings}
              currentPatient={currentPatient}
              patients={patients}
              selectedFilterPatientId={selectedFilterPatientId}
              isLoading={recLoading}
              error={recError}
              openMenuRecordingId={openMenuRecordingId}
              isDeleting={isDeleting}
              isMovingToStandalone={recordingActions.isMovingToStandalone}
              onRecordingClick={handleRecordingClick}
              onMenuToggle={handleMenuToggle}
              onRenameClick={handleRenameClick}
              onAssignPatientClick={handleAssignPatientClick}
              onMoveToStandaloneClick={handleMoveToStandaloneClick}
              onDeleteClick={handleDeleteClick}
              truncateFileName={truncateFileName}
              onCreateRecording={handleCreateRecording}
            />
            
            <SidebarFooter />
          </div>
        )}
      </div>

      {/* Collapsed User Profile Dropdown */}
      {collapsed && showUserProfile && onLogout && user && (
        <CollapsedUserProfileDropdown
          show={showUserProfile}
          onSettingsClick={handleSettingsClick}
          onUpgradeClick={() => handleNavigate('/pricing')}
          onLogout={handleLogout}
        />
      )}

      {/* Modals */}
      <DeleteRecordingModal
        isOpen={deleteConfirm.show}
        recordingName={deleteConfirm.recordingName}
        isDeleting={isDeleting !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        truncateFileName={truncateFileName}
      />
      
      <RenameRecordingModal
        isOpen={recordingActions.renameRecordingId !== null}
        renameValue={recordingActions.renameValue}
        onValueChange={recordingActions.setRenameValue}
        onConfirm={recordingActions.handleRenameConfirm}
        onCancel={recordingActions.handleRenameCancel}
      />
      
      <AssignPatientModal
        isOpen={recordingActions.assignPatientRecordingId !== null}
        recordingId={recordingActions.assignPatientRecordingId}
        recordings={recordings}
        patients={patients}
        loadingPatients={loadingPatients}
        onAssign={recordingActions.handleAssignPatient}
        onCancel={recordingActions.handleAssignPatientCancel}
        onCreateNewPatient={() => {
          recordingActions.handleAssignPatientCancel();
          handleNavigate('/patients/new');
        }}
      />
      
      <MoveToStandaloneModal
        isOpen={recordingActions.moveToStandaloneConfirm.show}
        recordingName={recordingActions.moveToStandaloneConfirm.recordingName}
        patientName={recordingActions.moveToStandaloneConfirm.patientName}
        isMoving={recordingActions.isMovingToStandalone !== null}
        onConfirm={recordingActions.handleMoveToStandaloneConfirm}
        onCancel={recordingActions.handleMoveToStandaloneCancel}
        truncateFileName={truncateFileName}
      />
      
      {/* Toast Notifications */}
      <ToastNotification show={toast.show} message={toast.message} type={toast.type} />
      <ToastNotification show={recordingActions.actionToast.show} message={recordingActions.actionToast.message} type={recordingActions.actionToast.type} />
      
      {/* Settings Modal */}
      <UserSettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
        initialSection={settingsInitialSection}
      />
      
      {/* Create Recording Popup */}
      <CreateRecordingPopup
        isOpen={showCreateRecordingPopup}
        onClose={() => setShowCreateRecordingPopup(false)}
        onImportAudio={handleImportFromCreate}
        preSelectedPatientId={contextPatientId || undefined}
        preSelectedPatientName={
          currentPatient 
            ? `${currentPatient.first_name} ${currentPatient.last_name}` 
            : undefined
        }
      />
      
      {/* Import Popup */}
      <ImportPopup
        isOpen={showImportPopup}
        onClose={() => setShowImportPopup(false)}
        onFileUpload={handleFileUpload}
        isProcessing={false}
        preSelectedPatientId={importPatientId}
      />
    </>
  );
};

export default LeftSidebar;

