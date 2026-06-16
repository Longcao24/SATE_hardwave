import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/react-query';
import type { TranscriptData, IssueCounts, SpeechAnalysis } from './types';
import { countErrors } from './errorCounter';
import { calculateSpeechAnalysis } from './speechAnalysis';

// Save recording with audio file and comprehensive analysis to Supabase
export const saveRecording = async (
  audioFile: File,
  transcriptData: TranscriptData,
  errorCounts: IssueCounts,
  userId: string,
  patientId?: string, // Add optional patient association
  metadata?: { name?: string; protocol?: string; note?: string } // Add optional metadata
): Promise<{ success: boolean; recordingId?: string; error?: string }> => {
  try {
    // 1. Upload audio file to storage
    const path = `${userId}/${Date.now()}_${audioFile.name}`;
    let uploadError = (await supabase.storage
      .from('recordings')
      .upload(path, audioFile, { upsert: true, cacheControl: '3600' })).error;

    // If bucket missing, create it then retry once
    if (uploadError && uploadError.message.includes('Bucket not found')) {
      const { error: bucketErr } = await supabase.storage.createBucket('recordings', { public: false });
      if (!bucketErr) {
        uploadError = (await supabase.storage
          .from('recordings')
          .upload(path, audioFile, { upsert: true, cacheControl: '3600' })).error;
      }
    }

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // Calculate comprehensive analysis
    const analysis = calculateSpeechAnalysis(transcriptData);

    // 2. Save recording metadata and transcript to database
    // Ensure UUID fields are properly handled - convert empty strings to null
    const insertData = {
      user_id: userId,
      file_path: path,
      transcript: transcriptData,
      error_counts: errorCounts,
      analysis: analysis,
      file_name: audioFile.name,
      file_size: audioFile.size,
      duration: 0, // Will be updated when audio loads
      patient_id: patientId && patientId.trim() !== '' ? patientId : null, // Convert empty string to null
      recording_name: metadata?.name || null,
      protocol: metadata?.protocol || null,
      notes: metadata?.note || null,
    };

    const { data: recording, error: insertError } = await supabase
      .from('recordings')
      .insert(insertData)
      .select('id')
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from('recordings').remove([path]);
      return { success: false, error: `Database insert failed: ${insertError.message}` };
    }

    // 3. Refresh recordings list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });

    return { success: true, recordingId: recording.id };

  } catch (error) {
    console.error('Failed to save recording:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Get recording URL from storage
export const getRecordingUrl = async (path: string): Promise<string | null> => {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('recordings').createSignedUrl(path, 3600);
  if (error) {
    console.error('Failed to create signed URL', error);
    return null;
  }
  return data?.signedUrl ?? null;
};

// Load recording data from database with full analysis
export const loadRecording = async (recordingId: string): Promise<{ 
  transcript: TranscriptData; 
  errorCounts: IssueCounts;
  analysis: SpeechAnalysis;
  audioUrl: string | null;
  fileName: string;
  recordingName: string | null;
  createdAt: string;
} | null> => {
  try {
    const { data: recording, error } = await supabase
      .from('recordings')
      .select('transcript, error_counts, analysis, file_path, file_name, recording_name, created_at')
      .eq('id', recordingId)
      .single();

    if (error || !recording) {
      console.error('Failed to load recording:', error);
      return null;
    }

    const audioUrl = await getRecordingUrl(recording.file_path);

    return {
      transcript: recording.transcript as TranscriptData,
      errorCounts: recording.error_counts as IssueCounts,
      analysis: recording.analysis as SpeechAnalysis,
      audioUrl,
      fileName: recording.file_name,
      recordingName: recording.recording_name,
      createdAt: recording.created_at,
    };
  } catch (error) {
    console.error('Error loading recording:', error);
    return null;
  }
};

// Keep the existing local JSON loading function for demo purposes
export const loadAndAnalyzeLocalJSON = async (): Promise<{ data: TranscriptData; errorCounts: IssueCounts }> => {
  try {
    // Try loading the new format first (mock_data.json), fallback to old format
    let response = await fetch('/mock_data.json');
    
    if (!response.ok) {
      // Fallback to old format
      response = await fetch('/673_v3.json');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch JSON: ${response.status}`);
      }
    }
    
    const data: TranscriptData = await response.json();
    
    // Validate structure
    if (!data.segments || !Array.isArray(data.segments)) {
      throw new Error('Invalid JSON structure: missing segments array');
    }

    // Count errors in the data
    const errorCounts = countErrors(data.segments);
    
    return { data, errorCounts };
  } catch (error) {
    console.error('Error loading local JSON:', error);
    throw error;
  }
};

// Delete recording from both database and storage
export const deleteRecording = async (
  recordingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Get recording details first to get file path
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('file_path')
      .eq('id', recordingId)
      .eq('user_id', userId) // Ensure user can only delete their own recordings
      .single();

    if (fetchError || !recording) {
      console.error('Failed to fetch recording for deletion:', fetchError);
      return { success: false, error: 'Recording not found or access denied' };
    }

    // 2. Delete from storage first
    const { error: storageError } = await supabase.storage
      .from('recordings')
      .remove([recording.file_path]);

    if (storageError) {
      console.error('Failed to delete from storage:', storageError);
      // Continue with DB deletion even if storage fails
    }

    // 3. Delete from database
    const { error: dbError } = await supabase
      .from('recordings')
      .delete()
      .eq('id', recordingId)
      .eq('user_id', userId); // Double-check user ownership

    if (dbError) {
      console.error('Failed to delete from database:', dbError);
      return { success: false, error: `Database deletion failed: ${dbError.message}` };
    }

    // 4. Refresh recordings list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });

    return { success: true };

  } catch (error) {
    console.error('Failed to delete recording:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Update existing recording with modified transcript data
export const updateRecording = async (
  recordingId: string,
  transcriptData: TranscriptData,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Recalculate error counts and analysis with updated transcript
    const errorCounts = countErrors(transcriptData.segments);
    const analysis = calculateSpeechAnalysis(transcriptData);

    // Update the recording in the database
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        transcript: transcriptData,
        error_counts: errorCounts,
        analysis: analysis,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordingId)
      .eq('user_id', userId); // Ensure user can only update their own recordings

    if (updateError) {
      return { success: false, error: `Database update failed: ${updateError.message}` };
    }

    // Refresh recordings list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });

    return { success: true };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Update recording name only
export const updateRecordingName = async (
  recordingId: string,
  recordingName: string,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Update the recording name in the database
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        recording_name: recordingName,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordingId)
      .eq('user_id', userId); // Ensure user can only update their own recordings

    if (updateError) {
      return { success: false, error: `Database update failed: ${updateError.message}` };
    }

    // Refresh recordings list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });

    return { success: true };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// First-time review of a device recording: set a real name + protocol (+ note)
// and clear the needs_review flag so the popup never shows for it again.
export const updateRecordingMetadata = async (
  recordingId: string,
  userId: string,
  metadata: { name: string; protocol: string; note?: string }
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        recording_name: metadata.name,
        protocol: metadata.protocol,
        notes: metadata.note || null,
        needs_review: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordingId)
      .eq('user_id', userId); // user can only update their own recordings

    if (updateError) {
      return { success: false, error: `Database update failed: ${updateError.message}` };
    }

    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

// Update recording patient assignment
export const updateRecordingPatient = async (
  recordingId: string,
  patientId: string | null,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Update the patient assignment in the database
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        patient_id: patientId,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordingId)
      .eq('user_id', userId); // Ensure user can only update their own recordings

    if (updateError) {
      return { success: false, error: `Database update failed: ${updateError.message}` };
    }

    // Refresh recordings list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['recordings', userId] });

    return { success: true };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

