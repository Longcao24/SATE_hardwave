import type { TranscriptData, IssueCounts, ProcessingError } from './types';
import { countErrors } from './errorCounter';

// Helper function to categorize and format errors
const categorizeError = (error: any, response?: Response): ProcessingError => {
  const errorString = error instanceof Error ? error.message : String(error);
  
  // Network/Connection errors
  if (error instanceof TypeError && errorString.includes('fetch')) {
    return {
      type: 'network',
      message: 'Unable to connect to the processing server. Please check your internet connection.',
      originalError: errorString,
      retryable: true
    };
  }
  
  // Timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'network',
      message: 'Server is taking longer than expected to respond. The server may be starting up or experiencing high load.',
      originalError: errorString,
      retryable: true
    };
  }
  
  // Server errors from response
  if (response && response.status >= 500) {
    return {
      type: 'server',
      message: 'The processing server is experiencing technical difficulties. This often happens when the server is starting up.',
      originalError: errorString,
      retryable: true
    };
  }
  
  // API errors from response body
  if (response && response.status >= 400) {
    let message = 'The server encountered an error while processing your audio file.';
    let apiType: 'api' | 'validation' = 'api';
    
    // Check for specific error patterns
    if (errorString.includes('float16') || errorString.includes('compute type')) {
      message = 'The server\'s processing hardware doesn\'t support the current settings. The system will try different processing options.';
      apiType = 'api';
    } else if (errorString.includes('CUDA') || errorString.includes('out of memory')) {
      message = 'The server\'s GPU is out of memory. The system will try processing with CPU instead.';
      apiType = 'api';
    } else if (errorString.includes('ValueError') || errorString.includes('Invalid')) {
      message = 'There was an issue with the audio file format or content. Try a different file or format.';
      apiType = 'validation';
    } else if (errorString.includes('File size') || errorString.includes('too large')) {
      message = 'The audio file is too large to process. Please use a file smaller than 50MB.';
      apiType = 'validation';
    }
    
    return {
      type: apiType,
      message,
      originalError: errorString,
      retryable: apiType === 'api'
    };
  }
  
  // Generic error fallback
  return {
    type: 'unknown',
    message: 'An unexpected error occurred while processing the audio file.',
    originalError: errorString,
    retryable: true
  };
};

// Helper function to make the actual API request
const makeAPIRequest = async (
  audioFile: File,
  device: string,
  pauseThreshold: number,
  onProgress?: (progress: number) => void,
  onTimeoutWarning?: () => void
): Promise<{ data: TranscriptData; errorCounts: IssueCounts }> => {
    // Create FormData for the API request
    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('device', device);
    formData.append('pause_threshold', pauseThreshold.toString());

    // Start progress tracking
    if (onProgress) {
      onProgress(10); // Initial progress
    }

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
    
    // Set up 2-minute warning timer
    const warningTimeoutId = setTimeout(() => {
      if (onTimeoutWarning) {
        onTimeoutWarning();
      }
    }, 120000); // 2 minute warning

    let response: Response;
    try {
      response = await fetch('https://sate-v1-5.ngrok.io/process', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // Don't set Content-Type header - let browser set it automatically for FormData
        // This ensures proper boundary is set for multipart/form-data
        headers: {
          // Add any additional headers that might be required by the API
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);
      clearTimeout(warningTimeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      clearTimeout(warningTimeoutId);
      
      const categorizedError = categorizeError(error);
      const enhancedError = new Error(categorizedError.message);
      (enhancedError as any).errorDetails = categorizedError;
      throw enhancedError;
    }

    if (onProgress) {
      onProgress(80); // Most of the work is done
    }
    
    if (!response.ok) {
    // Try to get error details from response
    let errorText = '';
    try {
      errorText = await response.text();
      console.error('API Error Response:', errorText);
    } catch (e) {
      console.error('Could not read error response:', e);
    }
    
    const categorizedError = categorizeError(errorText || `${response.status} ${response.statusText}`, response);
    const enhancedError = new Error(categorizedError.message);
    (enhancedError as any).errorDetails = categorizedError;
    throw enhancedError;
    }
    
    const result = await response.json();
    
    if (onProgress) {
      onProgress(90); // Parsing done
    }

    // Validate the response structure
    if (!result || !result.segments) {
      const categorizedError = categorizeError('Invalid response format from API');
      const enhancedError = new Error(categorizedError.message);
      (enhancedError as any).errorDetails = categorizedError;
      throw enhancedError;
    }

    // Count errors/issues in the data
    const errorCounts = countErrors(result.segments);

    if (onProgress) {
      onProgress(100); // Complete
    }

    return {
      data: result as TranscriptData,
      errorCounts
    };
};

// API processing function
export const processAudioFile = async (
  audioFile: File,
  device: string = 'cuda',
  pauseThreshold: number = 0.25,
  onProgress?: (progress: number) => void,
  onTimeoutWarning?: () => void
): Promise<{ data: TranscriptData; errorCounts: IssueCounts }> => {
  try {
    // Validate file before sending
    if (audioFile.size === 0) {
      const validationError = new Error('Audio file is empty. Please select a valid audio file.');
      (validationError as any).errorDetails = {
        type: 'validation',
        message: 'Audio file is empty. Please select a valid audio file.',
        originalError: 'File size is 0 bytes',
        retryable: false
      };
      throw validationError;
    }

    if (audioFile.size > 50 * 1024 * 1024) { // 50MB limit
      const validationError = new Error('Audio file is too large (max 50MB). Please select a smaller file.');
      (validationError as any).errorDetails = {
        type: 'validation',
        message: 'Audio file is too large (max 50MB). Please select a smaller file.',
        originalError: `File size: ${(audioFile.size / 1024 / 1024).toFixed(2)}MB`,
        retryable: false
      };
      throw validationError;
    }

    // Validate file type
    const validTypes = [
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mpeg', 'audio/mp3',
      'audio/mp4', 'audio/m4a',
      'audio/ogg', 'audio/webm',
      'audio/flac', 'audio/aac'
    ];
    
    if (!validTypes.includes(audioFile.type) && !audioFile.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i)) {
      const validationError = new Error(`Unsupported audio format: ${audioFile.type || 'unknown'}. Please use WAV, MP3, M4A, OGG, WebM, FLAC, or AAC files.`);
      (validationError as any).errorDetails = {
        type: 'validation',
        message: `Unsupported audio format. Please use WAV, MP3, M4A, OGG, WebM, FLAC, or AAC files.`,
        originalError: `File type: ${audioFile.type || 'unknown'}`,
        retryable: false
      };
      throw validationError;
    }

    // Try with the specified device first
    let result;
    try {
      result = await makeAPIRequest(audioFile, device, pauseThreshold, onProgress, onTimeoutWarning);
    } catch (error) {
      // Check if this is a categorized error with retry logic
      const errorDetails = (error as any).errorDetails as ProcessingError;
      
      // If CUDA fails with specific errors, try CPU as fallback
      if (device === 'cuda' && errorDetails && 
          (errorDetails.originalError?.includes('out of memory') || 
           errorDetails.originalError?.includes('CUDA failed') ||
           errorDetails.originalError?.includes('float16') ||
           errorDetails.originalError?.includes('compute type'))) {
        console.warn('CUDA processing failed, falling back to CPU processing...');
        if (onProgress) onProgress(10); // Reset progress for retry
        
        try {
          result = await makeAPIRequest(audioFile, 'cpu', pauseThreshold, onProgress, onTimeoutWarning);
        } catch (cpuError) {
          // If CPU also fails, throw the original error with enhanced message
          const enhancedError = new Error('Processing failed on both GPU and CPU. Please try again or use a different audio file.');
          (enhancedError as any).errorDetails = {
            type: 'server',
            message: 'Processing failed on both GPU and CPU. The server may be experiencing issues.',
            originalError: `GPU: ${errorDetails.originalError || 'Unknown error'}, CPU: ${(cpuError as any).errorDetails?.originalError || 'Unknown error'}`,
            retryable: true
          };
          throw enhancedError;
        }
      } else {
        // Re-throw the original error with its categorization
        throw error;
      }
    }

    return result;

  } catch (error) {
    console.error('API processing failed:', error);
    
    // If the error already has errorDetails, preserve them
    if ((error as any).errorDetails) {
      throw error;
    }
    
    // Otherwise, create a generic error
    const genericError = new Error(
      error instanceof Error 
        ? `Failed to process audio: ${error.message}`
        : 'Failed to process audio file'
    );
    (genericError as any).errorDetails = {
      type: 'unknown',
      message: 'An unexpected error occurred while processing the audio file.',
      originalError: error instanceof Error ? error.message : String(error),
      retryable: true
    };
    throw genericError;
  }
};

