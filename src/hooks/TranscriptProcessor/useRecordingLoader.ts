import { useNavigate } from 'react-router-dom';
import { 
  loadAndAnalyzeLocalJSON, 
  loadRecording, 
  calculateSpeechAnalysis, 
  getErrorAnnotations 
} from '@/services/dataService';
import { audioStorageService } from '@/services/audioStorageService';
import { normalizeSegments } from '@/components/Recording/ConversationView/utils/segmentOperations';
import type { Segment, IssueCounts, SpeechAnalysis } from './types';

interface RecordingLoaderDeps {
  setIsDataLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setTranscriptData: (data: Segment[]) => void;
  setIssueCounts: (counts: IssueCounts) => void;
  setSpeechAnalysis: (analysis: SpeechAnalysis | null) => void;
  setCurrentRecordingName: (name: string) => void;
  setCurrentRecordingDate: (date: string) => void;
  setCurrentRecordingFlags: (flags: number[]) => void;
  setCurrentRecordingFlagNotes: (notes: Record<string, string>) => void;
  setCurrentRecordingId: (id: string | null) => void;
  setAvailableErrorTypes: (types: string[]) => void;
  setActiveFilters: (filters: string[]) => void;
  setIsEditMode: (mode: boolean) => void;
}

/**
 * Hook to handle loading sample data and recordings by ID
 */
export function useRecordingLoader(deps: RecordingLoaderDeps) {
  const navigate = useNavigate();

  const loadSampleData = async () => {
    try {
      deps.setIsDataLoading(true);
      deps.setDataError(null);
      
      // Reset edit mode when loading sample data
      deps.setIsEditMode(false);
      
      // Load local JSON file and analyze for errors
      const { data, errorCounts } = await loadAndAnalyzeLocalJSON();
      
      // Normalize segments to ensure all pauses have proper index field
      const normalizedSegments = normalizeSegments(data.segments);
      
      deps.setTranscriptData(normalizedSegments);
      deps.setIssueCounts(errorCounts);
      
      // Calculate speech analysis
      const normalizedData = { ...data, segments: normalizedSegments };
      const analysis = calculateSpeechAnalysis(normalizedData);
      deps.setSpeechAnalysis(analysis);
      
      // Set the current recording name for sample data
      deps.setCurrentRecordingName('Sample Audio (673_clip.wav)');
      deps.setCurrentRecordingDate(new Date().toISOString());
      deps.setCurrentRecordingFlags([]); // sample data has no device flags
      deps.setCurrentRecordingFlagNotes({});
      deps.setCurrentRecordingId(null); // Sample data, no recording ID
      
      // Get available error types for filtering
      const errorTypes = getErrorAnnotations(normalizedSegments);
      deps.setAvailableErrorTypes(errorTypes);
      
      // Set initial filters to only show errors
      deps.setActiveFilters(errorTypes);

      // Cache sample audio from URL
      const cachedUrl = await audioStorageService.cacheAudioFromUrl('/sound/673_clip.wav');
      
      // Navigate to sample route after data is loaded successfully
      navigate('/sample');
      
      return cachedUrl;
      
    } catch (error) {
      console.error('Failed to load sample data:', error);
      deps.setDataError(error instanceof Error ? error.message : 'Failed to load sample data');
      return null;
    } finally {
      deps.setIsDataLoading(false);
    }
  };

  const loadRecordingById = async (recordingId: string) => {
    try {
      deps.setIsDataLoading(true);
      deps.setDataError(null);
      
      // Reset edit mode when loading a new recording
      deps.setIsEditMode(false);
      
      // Load complete recording data
      const recordingData = await loadRecording(recordingId);
      if (recordingData) {
        // Normalize segments to ensure all pauses have proper index field
        const normalizedSegments = normalizeSegments(recordingData.transcript.segments);
        
        // Set transcript data
        deps.setTranscriptData(normalizedSegments);
        deps.setIssueCounts(recordingData.errorCounts);
        
        // Calculate speech analysis (or use saved analysis if available)
        const normalizedTranscript = { ...recordingData.transcript, segments: normalizedSegments };
        const analysis = recordingData.analysis || calculateSpeechAnalysis(normalizedTranscript);
        deps.setSpeechAnalysis(analysis);
        
        // Set the current recording name and ID - use recording_name if available, otherwise fall back to file_name
        deps.setCurrentRecordingName(recordingData.recordingName || recordingData.fileName);
        deps.setCurrentRecordingDate(recordingData.createdAt);
        deps.setCurrentRecordingFlags(recordingData.flags || []);
        deps.setCurrentRecordingFlagNotes(recordingData.flagNotes || {});
        deps.setCurrentRecordingId(recordingId);
        
        // Get available error types for filtering
        const errorTypes = getErrorAnnotations(normalizedSegments);
        deps.setAvailableErrorTypes(errorTypes);
        deps.setActiveFilters(errorTypes);
        
        return recordingData.audioUrl || null;
      } else {
        deps.setDataError('Recording not found');
        navigate('/');
        return null;
      }
    } catch (error) {
      deps.setDataError('Failed to load recording');
      navigate('/');
      return null;
    } finally {
      deps.setIsDataLoading(false);
    }
  };

  return {
    loadSampleData,
    loadRecordingById,
  };
}

