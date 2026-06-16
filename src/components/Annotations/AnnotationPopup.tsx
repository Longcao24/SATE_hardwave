import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface AnnotationDetails {
  type: string;
  content?: string;
  start: number;
  end: number;
  duration: number;
  position?: {
    x: number;
    y: number;
  };
  additionalInfo?: {
    words?: number[];
    wordIndex?: number;
    markLocation?: number;
    [key: string]: any;
  };
}

interface AnnotationPopupProps {
  annotation: AnnotationDetails | null;
  annotations?: AnnotationDetails[]; // Support for multiple annotations
  onClose: () => void;
  onSeek: (timestamp: string) => void;
}

const AnnotationPopup: React.FC<AnnotationPopupProps> = ({ 
  annotation, 
  annotations,
  onClose, 
  // onSeek // Currently unused but kept for future functionality
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{x: number, y: number} | null>(null);
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState<number>(0);
  
  // Determine which annotations to display
  const annotationsToShow = annotations && annotations.length > 0 ? annotations : (annotation ? [annotation] : []);
  const currentAnnotation = annotationsToShow[selectedAnnotationIndex] || annotation;
  const hasMultiple = annotationsToShow.length > 1;

  // Calculate smart positioning for sticky popup
  const calculateStickyPosition = (
    originalX: number, 
    originalY: number, 
    popupWidth: number, 
    popupHeight: number
  ) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minGap = 30; // Minimum gap to avoid covering content
    
    let adjustedX = originalX;
    let adjustedY = originalY + 8; // Default: show below element (preferred)
    
    // Check horizontal overflow for sticky positioning
    if (adjustedX + popupWidth / 2 > viewportWidth) {
      adjustedX = viewportWidth - popupWidth / 2 - 10;
    } else if (adjustedX - popupWidth / 2 < 0) {
      adjustedX = popupWidth / 2 + 10;
    }
    
    // For sticky positioning, we need to consider viewport-relative positions
    const spaceBelow = viewportHeight - (originalY - window.scrollY + 8);
    const spaceAbove = originalY - window.scrollY;
    
    // If there's enough space below, keep it below (preferred)
    if (spaceBelow >= popupHeight + 20) {
      adjustedY = originalY + 8; // Show below with small gap
    }
    // Only show above if there's enough space above with proper clearance
    else if (spaceAbove >= popupHeight + minGap) {
      adjustedY = originalY - popupHeight - minGap; // Show above with proper spacing
    }
    // If neither position has enough space, use the position with more space but ensure no overlap
    else if (spaceAbove > spaceBelow) {
      // Position at the top of viewport with margin to avoid covering content
      const safeTopPosition = window.scrollY + 15;
      const idealAbovePosition = originalY - popupHeight - minGap;
      adjustedY = Math.max(safeTopPosition, idealAbovePosition);
      
      // If the popup would still overlap the annotation, move it further up
      if (adjustedY + popupHeight > originalY - 10) {
        adjustedY = originalY - popupHeight - 15;
      }
    } else {
      // Position below but ensure it doesn't go off screen
      adjustedY = Math.min(window.scrollY + viewportHeight - popupHeight - 10, originalY + 8);
    }
    
    return { x: adjustedX, y: adjustedY };
  };

  // Reset selected index when annotations change
  useEffect(() => {
    setSelectedAnnotationIndex(0);
  }, [annotation, annotations]);

  // Update position when popup mounts or annotation changes, and handle scroll for sticky behavior
  useEffect(() => {
    const updatePosition = () => {
      const position = currentAnnotation?.position || annotation?.position;
      if (position && popupRef.current) {
        const popup = popupRef.current;
        const rect = popup.getBoundingClientRect();
        
        const stickyPosition = calculateStickyPosition(
          position.x,
          position.y,
          rect.width,
          rect.height
        );
        
        setAdjustedPosition(stickyPosition);
      }
    };

    // Initial position calculation
    updatePosition();

    // Add scroll listener for sticky behavior
    const handleScroll = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [annotation, annotations, currentAnnotation]);

  // Early return after all hooks
  if (!annotation && annotationsToShow.length === 0) {
    console.log('AnnotationPopup: No annotation to show');
    return null;
  }
  
  console.log('AnnotationPopup rendering with:', { annotation, currentAnnotation, annotationsToShow });

  // Get the position to use (adjusted or original)
  const getPopupPosition = () => {
    const position = currentAnnotation?.position || annotation?.position;
    if (adjustedPosition) {
      return {
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        transform: 'translateX(-50%)'
      };
    }
    
    return {
      left: position?.x || '50%',
      top: (position?.y || 0) + 8,
      transform: 'translateX(-50%)'
    };
  };

  // Render annotation tabs/indicators for multiple annotations
  const renderAnnotationTabs = () => {
    if (!hasMultiple) return null;
    
    return (
      <div className="flex gap-1 mb-3 pb-2 border-b border-gray-200">
        {annotationsToShow.map((ann, index) => (
          <button
            key={index}
            onClick={() => setSelectedAnnotationIndex(index)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              index === selectedAnnotationIndex
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
            }`}
            style={{
              borderLeftColor: index === selectedAnnotationIndex ? getAnnotationColor(ann.type) : undefined,
              borderLeftWidth: index === selectedAnnotationIndex ? '3px' : undefined,
            }}
          >
            {getAnnotationTitle(ann.type)}
          </button>
        ))}
      </div>
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  };

  const getAnnotationTitle = (type: string) => {
    const titles: Record<string, string> = {
      'filler': 'Filler Word',
      'repetition': 'Repetition',
      'mispronunciation': 'Mispronunciation',
      'morpheme': 'Inflectional morpheme',
      'morpheme-omission': 'Morpheme Omission',
      'revision': 'Revision',
      'utterance-error': 'Utterance Error',
      'pause': 'Pause',
      'maze': 'Maze'
    };
    return titles[type] || type;
  };

  const getAnnotationColor = (type: string) => {
    const colors: Record<string, string> = {
      'pause': '#3B82F6',
      'filler': '#FCD34D',
      'repetition': '#FB7185',
      'mispronunciation': '#F87171',
      'morpheme': '#10B981',
      'morpheme-omission': '#EF4444',
      'revision': '#8B5CF6',
      'utterance-error': '#DC2626',
      'maze': '#EF4444' // Red for maze in simple mode
    };
    return colors[type] || '#6B7280';
  };

  // Function currently unused but kept for future functionality
  // const getAnnotationDescription = (type: string) => {
  //   const descriptions: Record<string, string> = {
  //     'filler': 'A filler word or sound that doesn\'t add meaning to the speech',
  //     'repetition': 'Repeated words or phrases in the speech',
  //     'mispronunciation': 'A word that was pronounced incorrectly',
  //     'morpheme': 'A morphological variation or inflection',
  //     'morpheme-omission': 'Missing morphological ending or component',
  //     'revision': 'Self-correction or revision in speech',
  //     'utterance-error': 'An error or interruption in the utterance',
  //     'pause': 'A pause or silence in the speech'
  //   };
  //   return descriptions[type] || 'Speech annotation';
  // };

  // Function currently unused but kept for future functionality
  // const handlePlayFromStart = () => {
  //   onSeek(annotation.start.toString());
  //   onClose();
  // };

  // Special render for pause annotations
  if (currentAnnotation?.type === 'pause') {
    console.log('Rendering pause popup with currentAnnotation:', currentAnnotation);
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        
        {/* Pause Popup */}
        <div 
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-blue-200 p-4 min-w-[280px]"
          style={getPopupPosition()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getAnnotationColor('pause') }}
              />
              {getAnnotationTitle('pause')}
              {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multiple annotation tabs */}
          {renderAnnotationTabs()}

          {/* Duration Display */}
          <div className="mb-3">
            <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-center">
              <div className="text-xs text-blue-600 font-medium mb-1">Duration</div>
              <div className="text-2xl font-bold text-blue-800">
                {currentAnnotation.duration.toFixed(2)}s
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Special render for maze annotations (simple mode - combines all maze types)
  if (currentAnnotation?.type === 'maze') {
    const mazeComponents = currentAnnotation.additionalInfo?.mazeComponents || [];
    
    // Filter out filler components and specific content
    const filteredMazeComponents = mazeComponents.filter((component: any) => {
      // Hide filler type components
      if (component.type === 'filler') return false;
      
      const contentLower = component.content ? component.content.toLowerCase().trim() : '';
      
      // Temp hide for debuugging
      if (contentLower === 'um') return false;
      if (component.type === 'repetition') return false;
      if (component.type === 'revision' ) return false;
      
      return true;
    });
    
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        
        {/* Maze Popup */}
        <div 
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-red-200 p-4 min-w-[280px]"
          style={getPopupPosition()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getAnnotationColor('maze') }}
              />
              {getAnnotationTitle('maze')}
              {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multiple annotation tabs */}
          {renderAnnotationTabs()}

          {/* Maze Components Display - only show if there are components */}
          {filteredMazeComponents.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-gray-600 font-medium mb-2">Maze Components:</div>
              <div className="space-y-2">
                {filteredMazeComponents.map((component: any, index: number) => (
                  <div 
                    key={index}
                    className="bg-red-50 border border-red-200 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-red-800 uppercase">
                        {component.type}
                      </span>
                      {component.content && (
                        <span className="text-xs text-red-600">
                          "{component.content}"
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timing Information */}
          <div className="text-xs text-gray-500 border-t pt-2">
            <div className="flex justify-between">
              <span>Start: {currentAnnotation.start.toFixed(2)}s</span>
              <span>Duration: {currentAnnotation.duration.toFixed(2)}s</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Special render for revision annotations
  if (currentAnnotation?.type === 'revision') {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        
        {/* Enhanced Revision Popup */}
        <div 
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[280px]"
          style={getPopupPosition()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getAnnotationColor(currentAnnotation.type) }}
              />
              {getAnnotationTitle(currentAnnotation.type)}
              {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multiple annotation tabs */}
          {renderAnnotationTabs()}

          {/* Revision Content Display */}
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-sm text-gray-600">Revised content:</span>
            </div>
            <div className="bg-purple-100 text-purple-800 px-3 py-2 rounded-md text-sm font-medium border border-purple-200">
              "{currentAnnotation.content}"
            </div>
          </div>

          {/* Word Position Info */}
          {currentAnnotation.additionalInfo?.words && (
            <div className="mb-3">
              <span className="text-xs text-gray-500">
                Affects word{currentAnnotation.additionalInfo.words.length > 1 ? 's' : ''}: {currentAnnotation.additionalInfo.words.join(', ')}
                {currentAnnotation.additionalInfo.markLocation !== undefined && 
                  ` (mark at position ${currentAnnotation.additionalInfo.markLocation})`
                }
              </span>
            </div>
          )}

          {/* Timing Information */}
          <div className="text-xs text-gray-500 border-t pt-2">
            <div className="flex justify-between">
              <span>Start: {currentAnnotation.start.toFixed(2)}s</span>
              <span>Duration: {currentAnnotation.duration.toFixed(2)}s</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Special render for morpheme omission annotations
  if (currentAnnotation?.type === 'morpheme-omission') {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        
        {/* Enhanced Morpheme Omission Popup */}
        <div 
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[220px]"
          style={getPopupPosition()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {getAnnotationTitle(currentAnnotation.type)}
              {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multiple annotation tabs */}
          {renderAnnotationTabs()}

          {/* Word and Missing Morpheme Display */}
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-sm text-gray-600">Word:</span>
              <div className="bg-red-100 text-red-800 px-3 py-1 rounded-md text-sm font-medium">
                {currentAnnotation.additionalInfo?.word || 'Unknown'}
              </div>
            </div>
            
            <div className="flex items-center gap-1 mb-2">
              <span className="text-sm text-gray-600">Base form:</span>
              <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-md text-sm font-medium">
                {currentAnnotation.additionalInfo?.lemma || 'Unknown'}
              </div>
            </div>
          </div>

          {/* Missing Morpheme Category */}
          {currentAnnotation.additionalInfo?.inflectionalMorpheme && (
            <div className="text-center mb-3 p-2 bg-red-50 border border-red-200 rounded-md">
              <div className="text-xs text-red-600 font-medium mb-1">Missing Morpheme:</div>
              <span className="text-sm text-red-800 font-semibold">
                {currentAnnotation.additionalInfo.inflectionalMorpheme}
              </span>
            </div>
          )}

          {/* Timing Information */}
          <div className="space-y-1 text-xs text-gray-600 border-t border-gray-100 pt-3">
            <div>
              <span className="font-medium">Start:</span> {currentAnnotation.start.toFixed(3)}s
            </div>
            <div>
              <span className="font-medium">End:</span> {currentAnnotation.end.toFixed(3)}s
            </div>
          </div>
        </div>
      </>
    );
  }

  // Special render for morpheme annotations
  if (currentAnnotation?.type === 'morpheme') {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
        
        {/* Enhanced Morpheme Popup */}
        <div 
          ref={popupRef}
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[200px]"
          style={getPopupPosition()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {getAnnotationTitle(currentAnnotation.type)}
              {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multiple annotation tabs */}
          {renderAnnotationTabs()}

          {/* Morpheme Components Display */}
          {currentAnnotation.additionalInfo?.lemma && currentAnnotation.additionalInfo?.morphemeForm && (
            <div className="flex items-center gap-1 mb-3">
              <div className="bg-green-100 text-green-800 px-3 py-2 rounded-md text-sm font-medium">
                {currentAnnotation.additionalInfo.lemma}
              </div>
              <div className="bg-pink-100 text-pink-800 px-3 py-2 rounded-md text-sm font-medium">
                {currentAnnotation.additionalInfo.morphemeForm}
              </div>
            </div>
          )}

          {/* Morpheme Category */}
          {currentAnnotation.additionalInfo?.inflectionalMorpheme && (
            <div className="text-center mb-3">
              <span className="text-sm text-gray-700 font-medium">
                {currentAnnotation.additionalInfo.inflectionalMorpheme}
              </span>
            </div>
          )}

          {/* Timing Information */}
          <div className="space-y-1 text-xs text-gray-600 border-t border-gray-100 pt-3">
            <div>
              <span className="font-medium">Start:</span> {currentAnnotation.start.toFixed(3)}
            </div>
            <div>
              <span className="font-medium">End:</span> {currentAnnotation.end.toFixed(3)}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Default render for other annotation types
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Compact Popup */}
      <div 
        ref={popupRef}
        className="absolute z-50 bg-white rounded-md shadow-lg border border-gray-200 p-3 max-w-xs"
        style={getPopupPosition()}
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getAnnotationColor(currentAnnotation?.type || 'filler') }}
            />
            <h3 className="text-sm font-semibold text-gray-900">
              {getAnnotationTitle(currentAnnotation?.type || 'filler')}
            </h3>
            {hasMultiple && <span className="text-xs text-gray-500">({selectedAnnotationIndex + 1}/{annotationsToShow.length})</span>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Multiple annotation tabs */}
        {renderAnnotationTabs()}

        {/* Compact Timing Information */}
        {currentAnnotation && (
          <>
            <div className="space-y-1 text-xs text-gray-600">
              <div>
                <span className="font-medium">Start:</span> {formatTime(currentAnnotation.start)}
              </div>
              <div>
                <span className="font-medium">End:</span> {formatTime(currentAnnotation.end)}
              </div>
              <div>
                <span className="font-medium">Duration:</span> {currentAnnotation.duration.toFixed(2)}s
              </div>
            </div>

            {/* Content if available */}
            {currentAnnotation.content && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Content:</span> "{currentAnnotation.content}"
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default AnnotationPopup; 