import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  editMode: boolean;
  selectionMode: boolean;
  mergeMode: boolean;
  splitMode: boolean;
  excludeMode: boolean;
  annotationMode: boolean;
  toggleEditMode: () => void;
  toggleSelectionMode: () => void;
  toggleMergeMode: () => void;
  toggleSplitMode: () => void;
  toggleExcludeMode: () => void;
  toggleAnnotationMode: () => void;
  selectAllSegments: () => void;
  resetAllModes: () => void;
  isModalOpen: boolean;
  inlineEditingSegment: number | null;
  contextMenuOpen: boolean;
}

export const useKeyboardShortcuts = ({
  editMode,
  selectionMode,
  mergeMode,
  splitMode,
  excludeMode,
  annotationMode,
  toggleEditMode,
  toggleSelectionMode,
  toggleMergeMode,
  toggleSplitMode,
  toggleExcludeMode,
  toggleAnnotationMode,
  selectAllSegments,
  resetAllModes,
  isModalOpen,
  inlineEditingSegment,
  contextMenuOpen
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    // Keyboard shortcuts disabled - using alternative edit mechanism
    // All edit mode controls should be accessed via UI buttons
    return () => {};
  }, [
    editMode, selectionMode, mergeMode, annotationMode, splitMode, excludeMode,
    toggleEditMode, toggleSelectionMode, toggleMergeMode, toggleAnnotationMode,
    toggleSplitMode, toggleExcludeMode, selectAllSegments, resetAllModes,
    isModalOpen, inlineEditingSegment, contextMenuOpen
  ]);
};
