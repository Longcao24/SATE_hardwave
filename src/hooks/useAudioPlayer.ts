import { useState, useRef, useEffect } from 'react';
import { validateSeekTimestamp } from '@/lib/utils';
import { type Segment } from '@/services/dataService';

interface UseAudioPlayerProps {
  transcriptData?: Segment[];
}

export function useAudioPlayer({ transcriptData = [] }: UseAudioPlayerProps = {}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [segmentEndTime, setSegmentEndTime] = useState<number | null>(null);
  const isAutoPausingRef = useRef(false);

  // Audio effects
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      
      // Check if we've reached the segment end time and should stop
      if (segmentEndTime !== null && audio.currentTime >= segmentEndTime) {
        isAutoPausingRef.current = true; // Flag that we're auto-pausing
        audio.pause();
        // Keep the time just before the segment end so it stays highlighted
        // Subtract a small amount (10ms) to ensure we stay within the segment bounds
        const stayWithinSegment = segmentEndTime - 0.01;
        audio.currentTime = stayWithinSegment;
        setCurrentTime(stayWithinSegment);
        setSegmentEndTime(null); // Clear the segment end time
        isAutoPausingRef.current = false; // Reset the flag
      }
    };
    
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        setAudioLoaded(true);
      }
    };
    
    const handlePlay = () => {
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      // If user manually pauses (not auto-pause from segment end),
      // clear segment end time restriction so normal playback can resume
      if (!isAutoPausingRef.current && segmentEndTime !== null) {
        setSegmentEndTime(null);
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setSegmentEndTime(null); // Clear the segment end time
    };

    const handleLoadedMetadata = () => {
      updateDuration();
    };

    const handleLoadedData = () => {
      updateDuration();
    };

    const handleCanPlay = () => {
      updateDuration();
    };

    const handleError = () => {
      // Audio error occurred
    };

    const handleLoadStart = () => {
      // Audio load started
    };

    // Add event listeners
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);

    // Set up audio source if available
    if (audioUrl && audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.preload = 'metadata';
      audio.load();
    }

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [audioUrl, segmentEndTime]);

  // Update audio source when audioUrl changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audioUrl) {
      audio.src = audioUrl;
      audio.preload = 'metadata';
      audio.load();
    }
  }, [audioUrl]);

  // Update playback speed when it changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Audio controls
  const togglePlayPause = async () => {
    const audio = audioRef.current;
    
    if (!audio) {
      return;
    }
    
    if (!audioLoaded) {
      return;
    }
    
    try {
      if (isPlaying) {
        audio.pause();
      } else {
        try {
          await audio.play();
        } catch (playError: any) {
          throw playError;
        }
      }
    } catch (error) {
      // Error toggling play/pause
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioLoaded) return;
    
    // Validate timestamp and fix overlaps if needed
    const validation = validateSeekTimestamp(time, transcriptData);
    const targetTime = validation.adjustedTimestamp || time;
    
    const clampedTime = Math.max(0, Math.min(targetTime, duration));
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  const seekToTimestamp = (timestamp: string) => {
    // Handle direct timestamp values (e.g., "3.565")
    const time = parseFloat(timestamp);
    if (!isNaN(time)) {
      seekTo(time);
    } else {
      // Fallback for other formats like "start:end"
      const [start] = timestamp.split(':').map(Number);
      if (!isNaN(start)) {
        seekTo(start);
      }
    }
  };

  // Stop and reset audio
  const stopAndReset = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
      setSegmentEndTime(null);
    }
  };

  // Play a specific segment (from start to end)
  const playSegment = async (startTime: number, endTime: number) => {
    const audio = audioRef.current;
    if (!audio || !audioLoaded) return;
    
    try {
      // Set the segment end time so we can stop when we reach it
      setSegmentEndTime(endTime);
      
      // Seek to the start time
      const clampedStart = Math.max(0, Math.min(startTime, duration));
      audio.currentTime = clampedStart;
      setCurrentTime(clampedStart);
      
      // Start playing
      await audio.play();
    } catch (error) {
      console.error('Error playing segment:', error);
      setSegmentEndTime(null);
    }
  };

  // Keyboard event handler for spacebar play/pause
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only trigger if spacebar is pressed and not in an input/textarea/contenteditable element
      if (event.code === 'Space' && 
          !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName) &&
          !(event.target as HTMLElement)?.isContentEditable) {
        event.preventDefault(); // Prevent page scroll
        togglePlayPause();
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyPress);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [audioLoaded, isPlaying]); // Dependencies to ensure the latest state is captured

  return {
    // Ref
    audioRef,
    
    // State
    currentTime,
    duration,
    isPlaying,
    audioLoaded,
    audioUrl,
    playbackSpeed,
    segmentEndTime,
    
    // Actions
    togglePlayPause,
    seekTo,
    seekToTimestamp,
    setAudioUrl,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
    stopAndReset,
    playSegment,
  };
}
