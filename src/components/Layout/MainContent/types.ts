import type { Segment, IssueCounts } from '@/services/dataService';
import type { EditingState, EditingActions } from '../../Recording/ConversationView/types';

export interface MainContentProps {
  currentTime: number;
  onSeek: (timestamp: string) => void;
  activeFilters: string[];
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onSeekTo: (time: number) => void;
  duration: number;
  onNextWord: () => void;
  onPrevWord: () => void;
  onToggleFilter: (filter: string) => void;
  onToggleCategory: (category: string) => void;
  categoryExpanded: {[key: string]: boolean};
  onApplyPreset: (preset: string) => void;
  transcriptData: Segment[];
  issueCounts: IssueCounts;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  onTimeUpdate?: (currentTime: number) => void;
  availableErrorTypes?: string[];
  showControls?: boolean;
  recordingName?: string;
  onRecordingNameChange?: (newName: string) => void;
  createdDate?: string;
  isEditable?: boolean;
  onTranscriptChange?: (updatedSegments: Segment[]) => void;
  onSaveChanges?: () => void;
  onCancelEdit?: () => void;
  onEditingStateChange?: (state: EditingState, actions: EditingActions) => void;
  isSampleData?: boolean;
  onBackToDashboard?: () => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  recordingId?: string;
  onPlaySegment?: (startTime: number, endTime: number) => Promise<void>;
  // Device flag markers (ms offsets) for this recording, shown on the seek bar.
  flags?: number[];
}


