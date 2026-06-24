import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { type IssueCounts } from '@/services/dataService';
import { getButtonColor, getAnnotationLabel } from '@/lib/annotationColors';

interface AudioControlsProps {
  onTimeUpdate?: (currentTime: number) => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlayPause: () => void;
  onSeekTo: (time: number) => void;
  onNextWord: () => void;
  onPrevWord: () => void;
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  onToggleCategory: (category: string) => void;
  categoryExpanded: {[key: string]: boolean};
  onApplyPreset: (preset: string) => void;
  issueCounts: IssueCounts;
  availableErrorTypes?: string[];
  isSimpleAnnotationMode?: boolean;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  // Flag markers (ms offsets) the clinician hit on the hardware device while
  // recording. Rendered as clickable ticks on the seek bar.
  flags?: number[];
}

const AudioControls: React.FC<AudioControlsProps> = ({ 

  audioRef: externalAudioRef, 
  isPlaying, 
  currentTime, 
  duration, 
  onTogglePlayPause, 
  onSeekTo, 

  activeFilters, 
  onToggleFilter, 

  issueCounts, 
  availableErrorTypes = [],
  isSimpleAnnotationMode = true,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  flags = []
}) => {
  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const audioRef = externalAudioRef || internalAudioRef;
  
  // Safety check for activeFilters
  const safeActiveFilters = activeFilters || [];
  
  const [volume] = useState(80);
  const [isSpeedDropdownOpen, setIsSpeedDropdownOpen] = useState(false);
  
  // Available playback speeds
  const playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set initial volume
    audio.volume = volume / 100;
  }, [audioRef, volume]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.speed-dropdown-container')) {
        setIsSpeedDropdownOpen(false);
      }
    };

    if (isSpeedDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSpeedDropdownOpen]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === undefined || seconds === null) {
      return "0:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isAudioReady = duration > 0;

  const handlePlayPause = () => {
    if (!isAudioReady) return;
    onTogglePlayPause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAudioReady) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    
    onSeekTo(newTime);
  };

  const skipBackward = () => {
    if (!isAudioReady) return;
    
    const newTime = Math.max(0, currentTime - 10);
    onSeekTo(newTime);
  };

  const skipForward = () => {
    if (!isAudioReady) return;
    
    const newTime = Math.min(duration, currentTime + 10);
    onSeekTo(newTime);
  };

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200">
      {/* Top Row - Time and Progress Bar with full width */}
      <div className="px-6 py-3">
        <div className="flex items-center gap-4 mb-2">
        {/* Current Time */}
          <span className="text-sm font-mono text-gray-700 min-w-[50px]">
          {formatTime(currentTime)}
        </span>

          {/* Progress Bar - Full Width */}
          <div className="flex-1">
            <div 
              className={`h-3 bg-gray-200 rounded-full relative group ${isAudioReady ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              onClick={handleSeek}
            >
              <div
                className="h-3 bg-blue-600 rounded-full relative transition-all duration-150"
                style={{ width: `${progressPercentage}%` }}
              >
                {isAudioReady && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>

              {/* Device flag markers — amber ticks at each flagged moment. */}
              {isAudioReady && flags
                .map((ms) => ms / 1000)
                .filter((sec) => sec >= 0 && sec <= duration)
                .map((sec, i) => (
                  <button
                    key={`flag-${i}-${sec}`}
                    type="button"
                    title={`Flagged moment · ${formatTime(sec)}`}
                    onClick={(e) => { e.stopPropagation(); onSeekTo(sec); }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-5 bg-amber-500 rounded-sm border border-white shadow hover:bg-amber-600 z-10"
                    style={{ left: `${(sec / duration) * 100}%` }}
                  />
                ))}
            </div>
          </div>

          {/* Duration */}
          <span className="text-sm font-mono text-gray-700 min-w-[50px]">
            {formatTime(duration)}
          </span>

          {/* Audio Status Indicator */}
          {!isAudioReady && (
            <span className="text-xs text-gray-500 italic">
              Loading audio...
            </span>
          )}
        </div>
      </div>

      {/* Bottom Row - Controls and Filters */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Left Side - Playback Controls */}
          <div className="flex items-center gap-4">
        {/* Skip Back Button */}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={skipBackward}
          disabled={!isAudioReady}
              className="h-10 w-10 text-gray-600 hover:text-gray-800 disabled:opacity-50"
          title="Skip back 10 seconds"
        >
              <SkipBack className="h-5 w-5" />
        </Button>

        {/* Play/Pause Button */}
        <Button 
          onClick={handlePlayPause}
          size="icon"
          disabled={!isAudioReady}
              className="h-12 w-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full disabled:opacity-50 disabled:bg-gray-400"
          title={isPlaying ? "Pause (Spacebar)" : "Play (Spacebar)"}
        >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
        </Button>

        {/* Skip Forward Button */}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={skipForward}
          disabled={!isAudioReady}
              className="h-10 w-10 text-gray-600 hover:text-gray-800 disabled:opacity-50"
          title="Skip forward 10 seconds"
        >
              <SkipForward className="h-5 w-5" />
        </Button>

            {/* Speed Control Dropdown */}
            <div className="relative speed-dropdown-container">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSpeedDropdownOpen(!isSpeedDropdownOpen)}
                disabled={!isAudioReady}
                className="h-10 px-3 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
                title="Playback speed"
              >
                Speed: {playbackSpeed}x
              </Button>

              {/* Dropdown Menu */}
              {isSpeedDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
                  {playbackSpeeds.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        if (onPlaybackSpeedChange) {
                          onPlaybackSpeedChange(speed);
                        }
                        setIsSpeedDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-100 transition-colors ${
                        speed === playbackSpeed ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {speed}x {speed === 1.0 && <span className="text-gray-500">(Normal)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
        </div>

          {/* Right Side - Filter Buttons (Hidden in Simple Mode) */}
          {!isSimpleAnnotationMode && (
            <div className="flex items-center gap-2 flex-wrap">
            {availableErrorTypes.map((errorType) => {
                const isActive = safeActiveFilters.includes(errorType);
                const buttonColor = getButtonColor(errorType, isActive);
                const label = getAnnotationLabel(errorType);
                const count = issueCounts[errorType as keyof IssueCounts] || 0;

              return (
                <Button 
                  key={errorType}
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleFilter(errorType)}
                    className={`text-sm px-3 py-2 border-0 rounded-full ${buttonColor} transition-colors`}
                    title={`Toggle ${label} (${count} found)`}
                >
                    {label}
                </Button>
              );
            })}

            {/* Show All / Hide All Button */}
            {availableErrorTypes.length > 0 && (
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  const allActive = availableErrorTypes.every(type => safeActiveFilters.includes(type));
                  if (allActive) {
                    // Clear all
                    availableErrorTypes.forEach(type => {
                      if (safeActiveFilters.includes(type)) {
                        onToggleFilter(type);
                      }
                    });
                  } else {
                    // Select all
                    availableErrorTypes.forEach(type => {
                      if (!safeActiveFilters.includes(type)) {
                        onToggleFilter(type);
                      }
                    });
                  }
                }}
                  className={`text-sm px-3 py-2 border-0 rounded-full transition-colors ${
                  availableErrorTypes.every(type => safeActiveFilters.includes(type))
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={`${availableErrorTypes.every(type => safeActiveFilters.includes(type)) ? 'Hide' : 'Show'} all error annotations`}
              >
                {availableErrorTypes.every(type => safeActiveFilters.includes(type)) ? 'Hide All' : 'Show All'}
              </Button>
            )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioControls;