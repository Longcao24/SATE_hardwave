import { useState, useCallback, useEffect } from 'react';
import type { EditingState, EditingActions } from '../../../Recording/ConversationView/types';

export const useEditingStateManager = (
  onEditingStateChange?: (state: EditingState, actions: EditingActions) => void,
  hasUnsavedChanges?: boolean
) => {
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [editingActions, setEditingActions] = useState<EditingActions | null>(null);

  const handleEditingStateChangeInternal = useCallback((state: EditingState, actions: EditingActions) => {
    setEditingState(state);
    setEditingActions(actions);
    // Also pass it up to parent with hasUnsavedChanges
    if (onEditingStateChange) {
      // Add hasUnsavedChanges to the state object
      const stateWithUnsavedChanges = {
        ...state,
        hasUnsavedChanges: hasUnsavedChanges || false
      };
      onEditingStateChange(stateWithUnsavedChanges, actions);
    }
  }, [onEditingStateChange, hasUnsavedChanges]);

  // Notify parent when hasUnsavedChanges changes
  useEffect(() => {
    if (onEditingStateChange && editingState && editingActions) {
      const stateWithUnsavedChanges = {
        ...editingState,
        hasUnsavedChanges: hasUnsavedChanges || false
      };
      onEditingStateChange(stateWithUnsavedChanges, editingActions);
    }
    
  }, [hasUnsavedChanges]);

  return {
    editingState,
    editingActions,
    handleEditingStateChangeInternal,
  };
};

