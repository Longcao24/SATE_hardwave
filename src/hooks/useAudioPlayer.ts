import { useState, useRef, useEffect } from 'react';
import { validateSeekTimestamp } from '@/lib/utils';
import { type Segment } from '@/services/dataService';

const MAX_URL_REFRESH_ATTEMPTS = 2;

interface UseAudioPlayerProps {
  transcriptData?: Segment[];
  // Re-signs the current recording's audio URL. Storage URLs are signed for a
  // limited window, so a long review session can outlive the signature and the
  // media element then fails on the next seek into an unbuffered region.
  refreshAudioUrl?: () => Promise<string | null>;
}

export function useAudioPlayer({ transcriptData = [], refreshAudioUrl }: UseAudioPlayerProps = {}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [segmentEndTime, setSegmentEndTime] = useState<number | null>(null);
  const isAutoPausingRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const resumeAtRef = useRef<number | null>(null);
  const refreshedUrlRef = useRef<string | null>(null);
  const refreshAttemptsRef = useRef(0);

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
        refreshAttemptsRef.current = 0;
        // Restore the position we were at when the previous source failed.
        if (resumeAtRef.current !== null) {
          const resumeAt = Math.max(0, Math.min(resumeAtRef.current, audio.duration));
          resumeAtRef.current = null;
          audio.currentTime = resumeAt;
          setCurrentTime(resumeAt);
        }
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
      if (!audioUrl) return;

      // The source is unusable: everything derived from it (play button, seek
      // clamping, tick positions) reads duration, so it must not stay stale.
      setIsPlaying(false);
      setAudioLoaded(false);
      setDuration(0);

      // Most likely cause is an expired signed URL. Re-sign once per source and
      // resume where playback was; without this the player stays wedged until a
      // full page reload. The attempt cap (reset once a source loads) stops a
      // permanently unreadable object from re-signing in a loop.
      if (!refreshAudioUrl || refreshedUrlRef.current === audioUrl || refreshAttemptsRef.current >= MAX_URL_REFRESH_ATTEMPTS) {
        setAudioError('Audio could not be loaded. Please reload the page.');
        return;
      }
      refreshedUrlRef.current = audioUrl;
      refreshAttemptsRef.current += 1;
      const failedUrl = audioUrl;
      const resumeAt = audio.currentTime;
      refreshAudioUrl()
        .then((freshUrl) => {
          // A different recording may have been opened while we were re-signing.
          if (audioUrlRef.current !== failedUrl) return;
          if (!freshUrl || freshUrl === failedUrl) {
            setAudioError('Audio could not be loaded. Please reload the page.');
            return;
          }
          resumeAtRef.current = resumeAt;
          setAudioUrl(freshUrl);
        })
        .catch(() => {
          if (audioUrlRef.current !== failedUrl) return;
          setAudioError('Audio could not be loaded. Please reload the page.');
        });
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
  }, [audioUrl, segmentEndTime, refreshAudioUrl]);

  // Update audio source when audioUrl changes
  useEffect(() => {
    audioUrlRef.current = audioUrl;

    const audio = audioRef.current;
    if (!audio) return;

    // Nothing derived from the previous source survives the switch: duration
    // clamps seeks and positions the flag ticks, so keeping it would apply the
    // old recording's timeline to the new transcript.
    setAudioLoaded(false);
    setDuration(0);
    setCurrentTime(0);
    setSegmentEndTime(null);
    setAudioError(null);

    if (audioUrl) {
      audio.src = audioUrl;
      audio.preload = 'metadata';
      audio.load();
    } else if (audio.src) {
      // Drop the previous recording's audio; leaving it attached would play the
      // wrong patient under the newly loaded transcript.
      audio.pause();
      audio.removeAttribute('src');
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
    } catch {
      setIsPlaying(false);
      setAudioError('Playback failed. Please try again.');
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

  // Raw seek to an exact time, WITHOUT the gap-snapping in seekTo's
  // validateSeekTimestamp. Used for device-flag clicks: a flag can fall in a
  // silent gap between utterances, and we must play that exact moment, not snap
  // to the next segment's start.
  const seekToExact = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioLoaded) return;
    const clampedTime = Math.max(0, Math.min(time, duration));
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
    audioError,
    playbackSpeed,
    segmentEndTime,
    
    // Actions
    togglePlayPause,
    seekTo,
    seekToExact,
    seekToTimestamp,
    setAudioUrl,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
    stopAndReset,
    playSegment,
  };
}
