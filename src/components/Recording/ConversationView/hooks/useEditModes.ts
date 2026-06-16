import { useState, useCallback } from 'react';

export const useEditModes = () => {
  const [editMode, setEditMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [excludeMode, setExcludeMode] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [splittingSegment, setSplittingSegment] = useState<number | null>(null);

  const resetAllModes = useCallback(() => {
    setEditMode(false);
    setSelectionMode(false);
    setMergeMode(false);
    setSplitMode(false);
    setExcludeMode(false);
    setAnnotationMode(false);
    setSplittingSegment(null);
  }, []);

  const toggleEditMode = useCallback(() => {
    if (!editMode) {
      resetAllModes();
      setEditMode(true);
    } else {
      setEditMode(false);
    }
  }, [editMode, resetAllModes]);

  const toggleSelectionMode = useCallback(() => {
    if (!selectionMode) {
      resetAllModes();
      setSelectionMode(true);
    } else {
      setSelectionMode(false);
    }
  }, [selectionMode, resetAllModes]);

  const toggleMergeMode = useCallback(() => {
    if (!mergeMode) {
      resetAllModes();
      setMergeMode(true);
    } else {
      setMergeMode(false);
    }
  }, [mergeMode, resetAllModes]);

  const toggleSplitMode = useCallback(() => {
    if (!splitMode) {
      resetAllModes();
      setSplitMode(true);
    } else {
      setSplitMode(false);
      setSplittingSegment(null);
    }
  }, [splitMode, resetAllModes]);

  const toggleExcludeMode = useCallback(() => {
    if (!excludeMode) {
      resetAllModes();
      setExcludeMode(true);
    } else {
      setExcludeMode(false);
    }
  }, [excludeMode, resetAllModes]);

  const toggleAnnotationMode = useCallback(() => {
    if (!annotationMode) {
      resetAllModes();
      setAnnotationMode(true);
    } else {
      setAnnotationMode(false);
    }
  }, [annotationMode, resetAllModes]);

  const toggleSplittingSegment = useCallback((segmentIndex: number) => {
    setSplittingSegment(splittingSegment === segmentIndex ? null : segmentIndex);
  }, [splittingSegment]);

  const isAnyModeActive = editMode || selectionMode || mergeMode || 
                          splitMode || excludeMode || annotationMode;

  return {
    // States
    editMode,
    selectionMode,
    mergeMode,
    splitMode,
    excludeMode,
    annotationMode,
    splittingSegment,
    isAnyModeActive,
    
    // Actions
    toggleEditMode,
    toggleSelectionMode,
    toggleMergeMode,
    toggleSplitMode,
    toggleExcludeMode,
    toggleAnnotationMode,
    toggleSplittingSegment,
    setSplittingSegment,
    resetAllModes
  };
};
