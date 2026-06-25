import { type Segment, type Word } from '@/services/dataService';
import type { AnnotationDetails } from '@/components/Annotations/AnnotationPopup';

export type { AnnotationDetails };

export interface EditingState {
  editModes: any;
  checkedSegments: Set<number>;
  selectedSegments: Set<number>;
  selectedWords: any[];
  selectedForMerge: number[];
  inlineEditingSegment: number | null;
  showHelp: boolean;
}

export interface EditingActions {
  toggleSelectionMode: () => void;
  toggleMergeMode: () => void;
  toggleSplitMode: () => void;
  toggleExcludeMode: () => void;
  toggleAnnotationMode: () => void;
  selectAllSegments: () => void;
  clearSelection: () => void;
  clearWordSelection: () => void;
  clearCheckedSegments: () => void;
  selectAllForCheckboxes: () => void;
  startSpeakerChange: () => void;
  mergeSegments: () => void;
  openAnnotationCreationPopup: (event: React.MouseEvent) => void;
  canMergeSegments: (indices: number[]) => boolean;
  setShowHelp: (show: boolean) => void;
  // Bulk operations for checked segments
  bulkSpeakerChange: () => void;
  bulkMergeSegments: () => void;
  bulkExcludeSegments: () => void;
  bulkIncludeSegments: () => void;
  bulkDeleteSegments: () => void;
}

export interface ConversationViewProps {
  currentTime: number;
  onSeek: (timestamp: string) => void;
  activeFilters: string[];
  transcriptData: Segment[];
  onTranscriptChange?: (updatedSegments: Segment[]) => void;
  isEditable?: boolean;
  onSeekTo?: (time: number) => void;
  isPlaying?: boolean;
  onTogglePlayPause?: () => void;
  duration?: number;
  isSimpleAnnotationMode?: boolean;
  onEditingStateChange?: (state: EditingState, actions: EditingActions) => void;
  onPlaySegment?: (startTime: number, endTime: number) => Promise<void>;
  // Device flag markers (ms offsets) hit on the hardware while recording.
  // Rendered as ticks on a vertical timeline rail beside the utterances.
  flags?: number[];
  flagNotes?: Record<string, string>;
  // Raw seek (no gap-snapping) for flag clicks, so they play the exact moment.
  onSeekExact?: (time: number) => void;
  onDeleteFlag?: (rawMs: number) => void;
  onUpdateFlagNote?: (rawMs: number, note: string) => void;
}

export interface SpeakerChangeData {
  segmentIndex?: number;
  currentSpeaker: string;
  newSpeaker: string;
  applyToAll: boolean;
}

export interface ContextMenuData {
  isOpen: boolean;
  position: { x: number; y: number };
  word: string;
  wordIndex: number;
  segmentIndex: number;
  existingAnnotations: Array<{ type: string; color: string }>;
}

export interface SelectedWord {
  segmentIndex: number;
  wordIndex: number;
  word: Word;
}

export interface EditingSegment {
  segment: Segment;
  index: number;
}

export interface PauseAnnotation {
  duration: number;
  color: string;
  start?: number;
  end?: number;
}

export type EditMode = 'edit' | 'selection' | 'merge' | 'split' | 'exclude' | 'annotation' | null;

export interface EditModeState {
  editMode: boolean;
  selectionMode: boolean;
  mergeMode: boolean;
  splitMode: boolean;
  excludeMode: boolean;
  annotationMode: boolean;
}
