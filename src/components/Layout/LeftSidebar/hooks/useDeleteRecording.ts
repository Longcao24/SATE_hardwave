import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { deleteRecording } from '@/services/dataService';

interface DeleteConfirmState {
  show: boolean;
  recordingId: string;
  recordingName: string;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export const useDeleteRecording = () => {
  const { user } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({ 
    show: false, 
    recordingId: '', 
    recordingName: '' 
  });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ 
    show: false, 
    message: '', 
    type: 'success' 
  });

  const handleDeleteClick = useCallback((recordingId: string, recordingName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ show: true, recordingId, recordingName });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!user || !deleteConfirm.recordingId) return;
    
    setIsDeleting(deleteConfirm.recordingId);
    
    try {
      const result = await deleteRecording(deleteConfirm.recordingId, user.id);
      
      setToast({
        show: true,
        message: result.success 
          ? `"${deleteConfirm.recordingName}" deleted successfully`
          : result.error || 'Failed to delete recording',
        type: result.success ? 'success' : 'error'
      });
    } catch (error) {
      console.error('Delete error:', error);
      setToast({
        show: true,
        message: 'An error occurred while deleting the recording',
        type: 'error'
      });
    } finally {
      setIsDeleting(null);
      setDeleteConfirm({ show: false, recordingId: '', recordingName: '' });
    }
  }, [user, deleteConfirm]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ show: false, recordingId: '', recordingName: '' });
  }, []);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ show: false, message: '', type: 'success' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  return {
    deleteConfirm,
    isDeleting,
    toast,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel
  };
};

