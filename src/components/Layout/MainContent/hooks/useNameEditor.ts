import { useState, useCallback } from 'react';

export const useNameEditor = (
  recordingName?: string,
  onRecordingNameChange?: (newName: string) => void
) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');

  const handleEditStart = useCallback(() => {
    setEditedName(recordingName || 'Untitled Report');
    setIsEditing(true);
  }, [recordingName]);

  const handleEditSave = useCallback(() => {
    if (onRecordingNameChange && editedName.trim()) {
      onRecordingNameChange(editedName.trim());
    }
    setIsEditing(false);
  }, [onRecordingNameChange, editedName]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditedName('');
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  return {
    isEditing,
    editedName,
    setEditedName,
    handleEditStart,
    handleEditSave,
    handleEditCancel,
    handleKeyPress,
  };
};


