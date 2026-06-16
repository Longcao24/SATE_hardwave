import { useState, useCallback } from 'react';
import { type Segment, type Word } from '@/services/dataService';
import { annotationColors } from '@/lib/annotationColors';
import type { SelectedWord, ContextMenuData } from '../types';
import type { AnnotationDetails } from '@/components/Annotations/AnnotationPopup';

export const useAnnotations = (
  transcriptData: Segment[],
  onTranscriptChange?: (updatedSegments: Segment[]) => void,
  activeFilters: string[] = [],
  isSimpleAnnotationMode: boolean = true,
  isPlaying?: boolean,
  onTogglePlayPause?: () => void
) => {
  const [selectedWords, setSelectedWords] = useState<SelectedWord[]>([]);
  const [showAnnotationCreationPopup, setShowAnnotationCreationPopup] = useState(false);
  const [annotationCreationPosition, setAnnotationCreationPosition] = useState({ x: 0, y: 0 });

  // Handle word selection in annotation mode
  const handleWordSelection = useCallback((
    segmentIndex: number,
    wordIndex: number,
    word: Word,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    
    const wordItem = { segmentIndex, wordIndex, word };
    
    setSelectedWords(prev => {
      const isSelected = prev?.some(w => 
        w.segmentIndex === segmentIndex && w.wordIndex === wordIndex
      );
      
      if (isSelected) {
        // Deselect word
        return prev?.filter(w => 
          !(w.segmentIndex === segmentIndex && w.wordIndex === wordIndex)
        ) || [];
      } else {
        // Select word
        return [...(prev || []), wordItem];
      }
    });
  }, []);

  // Clear word selection
  const clearWordSelection = useCallback(() => {
    setSelectedWords([]);
  }, []);

  // Open annotation creation popup
  const openAnnotationCreationPopup = useCallback((event: React.MouseEvent) => {
    if (!selectedWords || selectedWords.length === 0) return;
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setAnnotationCreationPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10
    });
    setShowAnnotationCreationPopup(true);
  }, [selectedWords]);

  // Close annotation creation popup
  const closeAnnotationCreationPopup = useCallback(() => {
    setShowAnnotationCreationPopup(false);
    setSelectedWords([]);
  }, []);

  // Handle right-click on word
  const handleWordRightClick = useCallback((
    event: React.MouseEvent,
    segmentIndex: number,
    wordIndex: number,
    word: Word,
    segment: Segment
  ): ContextMenuData => {
    event.preventDefault();
    event.stopPropagation();

    // Get existing annotations for this word - check all annotation types for context menu
    const allFilters = ['filler', 'repetition', 'revision', 'mispronunciation', 'morpheme', 'morpheme-omission'];
    const existingAnnotations = getWordAnnotations(segment, wordIndex, allFilters, isSimpleAnnotationMode);

    return {
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      word: word.word,
      wordIndex,
      segmentIndex,
      existingAnnotations
    };
  }, [activeFilters, isSimpleAnnotationMode]);

  // Get word annotations
  const getWordAnnotations = useCallback((
    segment: Segment,
    wordIndex: number,
    filters: string[] = activeFilters,
    simpleMode: boolean = isSimpleAnnotationMode
  ): Array<{type: string, color: string}> => {
    const annotations: Array<{type: string, color: string}> = [];
    const word = segment.words[wordIndex];

    if (simpleMode) {
      // Simple Mode: Only show maze annotations in red
      const redColor = '#EF4444';

      if (filters.includes('filler') && segment.fillerwords) {
        const isFillerWord = segment.fillerwords.some(filler => 
          filler.start === word.start && filler.end === word.end
        );
        if (isFillerWord) {
          annotations.push({ type: 'filler', color: redColor });
        }
      }

      if (filters.includes('repetition') && segment.repetitions) {
        const isInRepetition = segment.repetitions.some(rep => 
          rep.words.includes(wordIndex)
        );
        if (isInRepetition) {
          annotations.push({ type: 'repetition', color: redColor });
        }
      }

      if (filters.includes('revision') && segment.revisions) {
        const isInRevision = segment.revisions.some((rev: any) => {
          const wordIndices = rev.location || rev.words || [];
          return wordIndices.includes(wordIndex);
        });
        if (isInRevision) {
          annotations.push({ type: 'revision', color: redColor });
        }
      }

      if (filters.includes('mispronunciation') && segment.mispronunciation) {
        const isMispronunciation = segment.mispronunciation.some((mp: any) => 
          mp.start === word.start && mp.end === word.end
        );
        if (isMispronunciation) {
          annotations.push({ type: 'mispronunciation', color: redColor });
        }
      }
    } else {
      // Advanced Mode: Different colors for each annotation type
      if (filters.includes('filler') && segment.fillerwords) {
        const isFillerWord = segment.fillerwords.some(filler => 
          filler.start === word.start && filler.end === word.end
        );
        if (isFillerWord) {
          annotations.push({ type: 'filler', color: annotationColors.filler });
        }
      }

      if (filters.includes('repetition') && segment.repetitions) {
        const isInRepetition = segment.repetitions.some(rep => 
          rep.words.includes(wordIndex)
        );
        if (isInRepetition) {
          annotations.push({ type: 'repetition', color: annotationColors.repetition });
        }
      }

      if (filters.includes('mispronunciation') && segment.mispronunciation) {
        const isMispronunciation = segment.mispronunciation.some((mp: any) => 
          mp.start === word.start && mp.end === word.end
        );
        if (isMispronunciation) {
          annotations.push({ type: 'mispronunciation', color: annotationColors.mispronunciation });
        }
      }

      if (filters.includes('morpheme') && segment.morphemes) {
        const hasMorpheme = segment.morphemes.some(m => {
          const cleanWord = word.word.replace(/[.,!?;:]$/, '');
          const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanMorphemeWord && m.morpheme_form !== '<IRR>';
        });
        if (hasMorpheme) {
          annotations.push({ type: 'morpheme', color: annotationColors.morpheme });
        }
      }

      if (filters.includes('morpheme-omission') && segment.morpheme_omissions) {
        const hasMorphemeOmission = segment.morpheme_omissions.some((omission: any) => {
          if (omission.index === wordIndex) return true;
          const cleanWord = word.word.replace(/[.,!?;:]$/, '');
          const cleanOmissionWord = omission.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanOmissionWord;
        });
        if (hasMorphemeOmission) {
          annotations.push({ type: 'morpheme-omission', color: annotationColors['morpheme-omission'] });
        }
      }

      if (filters.includes('revision') && segment.revisions) {
        const isInRevision = segment.revisions.some((rev: any) => {
          const wordIndices = rev.location || rev.words || [];
          return wordIndices.includes(wordIndex);
        });
        if (isInRevision) {
          annotations.push({ type: 'revision', color: annotationColors.revision });
        }
      }
    }

    return annotations;
  }, [activeFilters, isSimpleAnnotationMode]);

  // Helper function to create annotation details for a specific type
  const createAnnotationDetails = useCallback((
    annotationType: string,
    segment: Segment,
    wordIndex: number,
    position: { x: number; y: number }
  ): AnnotationDetails | null => {
    const word = segment.words[wordIndex];
    
    switch (annotationType) {
      case 'filler':
        const fillerWord = segment.fillerwords?.find(filler => 
          filler.start === word.start && filler.end === word.end
        );
        if (fillerWord) {
          return {
            type: 'filler',
            content: fillerWord.content || '',
            start: fillerWord.start || 0,
            end: fillerWord.end || 0,
            duration: fillerWord.duration || 0,
            position,
            additionalInfo: { wordIndex }
          };
        }
        break;

      case 'repetition':
        const repetition = segment.repetitions?.find(rep => 
          rep.words.includes(wordIndex)
        );
        if (repetition) {
          return {
            type: 'repetition',
            content: repetition.content,
            start: word.start || 0,
            end: word.end || 0,
            duration: (word.end || 0) - (word.start || 0),
            position,
            additionalInfo: { 
              words: repetition.words,
              markLocation: repetition.mark_location 
            }
          };
        }
        break;

      case 'mispronunciation':
        const mispronunciation = segment.mispronunciation?.find(mp => 
          mp.start === word.start && mp.end === word.end
        );
        if (mispronunciation) {
          return {
            type: 'mispronunciation',
            content: word.word,
            start: mispronunciation.start,
            end: mispronunciation.end,
            duration: mispronunciation.end - mispronunciation.start,
            position,
            additionalInfo: { wordIndex }
          };
        }
        break;

      case 'morpheme':
        const morpheme = segment.morphemes?.find(m => {
          const cleanWord = word.word.replace(/[.,!?;:]$/, '');
          const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanMorphemeWord;
        });
        if (morpheme && morpheme.morpheme_form !== '<IRR>') {
          return {
            type: 'morpheme',
            content: `${morpheme.lemma} + ${morpheme.morpheme_form}`,
            start: word.start || 0,
            end: word.end || 0,
            duration: (word.end || 0) - (word.start || 0),
            position,
            additionalInfo: { 
              wordIndex,
              lemma: morpheme.lemma,
              morphemeForm: morpheme.morpheme_form,
              inflectionalMorpheme: morpheme.inflectional_morpheme,
              word: morpheme.word
            }
          };
        }
        break;

      case 'morpheme-omission':
        const morphemeOmission = segment.morpheme_omissions?.find((omission: any) => {
          if (omission.index === wordIndex) return true;
          const cleanWord = word.word.replace(/[.,!?;:]$/, '');
          const cleanOmissionWord = omission.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanOmissionWord;
        });
        if (morphemeOmission) {
          return {
            type: 'morpheme-omission',
            content: `Missing: ${morphemeOmission.inflectional_morpheme}`,
            start: word.start || 0,
            end: word.end || 0,
            duration: (word.end || 0) - (word.start || 0),
            position,
            additionalInfo: { 
              wordIndex,
              lemma: morphemeOmission.lemma,
              word: morphemeOmission.word,
              inflectionalMorpheme: morphemeOmission.inflectional_morpheme,
              morphemeForm: morphemeOmission.morpheme_form
            }
          };
        }
        break;

      case 'revision':
        const revision = segment.revisions?.find((rev: any) => {
          const wordIndices = rev.location || rev.words || [];
          return wordIndices.includes(wordIndex);
        });
        if (revision) {
          const wordIndices = revision.location || revision.words || [];
          return {
            type: 'revision',
            content: revision.content,
            start: word.start || 0,
            end: word.end || 0,
            duration: (word.end || 0) - (word.start || 0),
            position,
            additionalInfo: { 
              words: wordIndices,
              wordIndex,
              markLocation: revision.mark_location
            }
          };
        }
        break;

      case 'utterance-error':
        return {
          type: 'utterance-error',
          content: segment.text,
          start: segment.start,
          end: segment.end,
          duration: segment.end - segment.start,
          position,
          additionalInfo: { segmentIndex: wordIndex }
        };
    }

    return null;
  }, []);

  // Handle annotation click - collect all annotations for this word
  const handleAnnotationClick = useCallback((
    segment: Segment,
    wordIndex: number,
    event: React.MouseEvent,
    onSeek: (timestamp: string) => void
  ) => {
    event.stopPropagation();
    
    const word = segment.words[wordIndex];
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.bottom
    };

    // Get all annotations for this word
    const allFilters = ['filler', 'repetition', 'revision', 'mispronunciation', 'morpheme', 'morpheme-omission'];
    const wordAnnotations = getWordAnnotations(segment, wordIndex, allFilters, isSimpleAnnotationMode);
    
    // Collect all annotation details
    const annotationDetailsList: AnnotationDetails[] = [];
    
    for (const ann of wordAnnotations) {
      const details = createAnnotationDetails(ann.type, segment, wordIndex, position);
      if (details) {
        annotationDetailsList.push(details);
      }
    }

    // Seek to the word's start time
    if (word.start !== undefined && word.start !== null) {
      onSeek(word.start.toString());

      if (!isPlaying && onTogglePlayPause) {
        onTogglePlayPause();
      }
    }

    // In simple mode, group all maze annotations into a single "Maze" annotation
    if (isSimpleAnnotationMode && annotationDetailsList.length > 0) {
      const mazeTypes = ['filler', 'repetition', 'revision', 'mispronunciation'];
      const mazeAnnotations = annotationDetailsList.filter(ann => mazeTypes.includes(ann.type));
      const nonMazeAnnotations = annotationDetailsList.filter(ann => !mazeTypes.includes(ann.type));
      
      if (mazeAnnotations.length > 0) {
        // Filter maze components - exclude filler type and specific content
        const filteredMazeAnnotations = mazeAnnotations.filter(ann => {
          // Hide filler type components
          if (ann.type === 'filler') return false;
          
          const contentLower = ann.content ? ann.content.toLowerCase().trim() : '';
          
          // Hide specific maze content
          if (contentLower === 'um') return false;
          if (ann.type === 'repetition' && contentLower === 'with') return false;
          if (ann.type === 'revision' && contentLower === 'to') return false;
          
          return true;
        });
        
        // Create a unified "Maze" annotation that combines all maze components
        const mazeAnnotation: AnnotationDetails = {
          type: 'maze',
          content: filteredMazeAnnotations.map(ann => ann.content || ann.type).filter(Boolean).join(', '),
          start: word.start || 0,
          end: word.end || 0,
          duration: (word.end || 0) - (word.start || 0),
          position,
          additionalInfo: {
            wordIndex,
            mazeComponents: filteredMazeAnnotations.map(ann => ({
              type: ann.type,
              content: ann.content,
              ...ann.additionalInfo
            }))
          }
        };
        
        // Return maze annotation plus any non-maze annotations (morpheme, morpheme-omission)
        const result = [mazeAnnotation, ...nonMazeAnnotations];
        return result.length > 1 ? result : result[0] || null;
      }
    }

    // Return multiple annotations if found, otherwise just the first one (advanced mode)
    return annotationDetailsList.length > 1 ? annotationDetailsList : annotationDetailsList[0] || null;  }, [createAnnotationDetails, getWordAnnotations, isSimpleAnnotationMode, isPlaying, onTogglePlayPause]);

  const handlePauseClick = useCallback((
    pause: { duration: number; start?: number; end?: number; color: string },
    event: React.MouseEvent,
    onSeek: (timestamp: string) => void
  ): AnnotationDetails => {
    
    event.stopPropagation();
    
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left + rect.width / 2,
      y: rect.bottom
    };

    const annotationDetails: AnnotationDetails = {
      type: 'pause',
      start: pause.start || 0,
      end: pause.end || 0,
      duration: pause.duration,
      position
    };

    

    if (pause.start !== undefined && pause.start !== null) {
      
      onSeek(pause.start.toString());
      if (!isPlaying && onTogglePlayPause) {
        
        onTogglePlayPause();
      }
    } 
    
    return annotationDetails;
  }, [isPlaying, onTogglePlayPause]);

  // Add annotation via context menu
  const handleAddAnnotation = useCallback((type: string, _position?: 'before' | 'after', contextData?: any) => {
    if (!onTranscriptChange || !contextData) return;
    
    const { segmentIndex, wordIndex } = contextData;
    const updatedSegments = [...transcriptData];
    const segment = updatedSegments[segmentIndex];
    const word = segment.words[wordIndex];
    
    if (!segment || !word) return;
    
    // Add annotation based on type
    switch (type) {
      case 'filler':
        if (!segment.fillerwords) segment.fillerwords = [];
        segment.fillerwords.push({
          start: word.start || 0,
          end: word.end || 0,
          duration: (word.end || 0) - (word.start || 0),
          content: word.word
        });
        break;
        
      case 'repetition':
        if (!segment.repetitions) segment.repetitions = [];
        // Check if word is already in a repetition
        const existingRepetition = segment.repetitions.find(rep => rep.words.includes(wordIndex));
        if (!existingRepetition) {
          segment.repetitions.push({
            words: [wordIndex],
            content: word.word
          });
        }
        break;
        
      case 'revision':
        if (!segment.revisions) segment.revisions = [];
        segment.revisions.push({
          words: [wordIndex],
          location: [wordIndex],
          content: word.word
        });
        break;
        
      case 'mispronunciation':
        if (!segment.mispronunciation) segment.mispronunciation = [];
        segment.mispronunciation.push({
          start: word.start || 0,
          end: word.end || 0,
          content: word.word,
          correct_form: word.word // Default to same word, user can edit later
        });
        break;
        
      default:
        console.warn('Unknown annotation type:', type);
        return;
    }
    
    onTranscriptChange(updatedSegments);
  }, [onTranscriptChange, transcriptData]);

  // Remove annotation via context menu
  const handleRemoveAnnotation = useCallback((type: string, contextData?: any) => {
    if (!onTranscriptChange || !contextData) return;
    
    const { segmentIndex, wordIndex } = contextData;
    const updatedSegments = [...transcriptData];
    const segment = updatedSegments[segmentIndex];
    const word = segment.words[wordIndex];
    
    if (!segment || !word) return;
    
    // Remove annotation based on type
    switch (type) {
      case 'filler':
        if (segment.fillerwords) {
          segment.fillerwords = segment.fillerwords.filter(filler => 
            !(filler.start === word.start && filler.end === word.end)
          );
        }
        break;
        
      case 'repetition':
        if (segment.repetitions) {
          segment.repetitions = segment.repetitions.filter(rep => 
            !rep.words.includes(wordIndex)
          ).map(rep => ({
            ...rep,
            words: rep.words.filter(idx => idx !== wordIndex)
          })).filter(rep => rep.words.length > 0);
        }
        break;
        
      case 'revision':
        if (segment.revisions) {
          segment.revisions = segment.revisions.filter(rev => 
            !rev.words?.includes(wordIndex) && !rev.location?.includes(wordIndex)
          );
        }
        break;
        
      case 'mispronunciation':
        if (segment.mispronunciation) {
          segment.mispronunciation = segment.mispronunciation.filter(mp => 
            !(mp.start === word.start && mp.end === word.end)
          );
        }
        break;
        
      default:
        console.warn('Unknown annotation type:', type);
        return;
    }
    
    onTranscriptChange(updatedSegments);
  }, [onTranscriptChange, transcriptData]);

  // Convert annotation type via context menu
  const handleConvertAnnotation = useCallback((fromType: string, toType: string, contextData?: any) => {
    handleRemoveAnnotation(fromType, contextData);
    handleAddAnnotation(toType, undefined, contextData);
  }, [handleRemoveAnnotation, handleAddAnnotation]);

  // Save new annotations
  const saveNewAnnotations = useCallback((newAnnotations: Array<{
    type: string;
    segmentIndex: number;
    wordIndices: number[];
    data: any;
  }>) => {
    if (!onTranscriptChange) return;
    
    const updatedSegments = [...transcriptData];
    
    newAnnotations.forEach(annotation => {
      const segment = updatedSegments[annotation.segmentIndex];
      
      switch (annotation.type) {
        case 'filler':
          if (!segment.fillerwords) segment.fillerwords = [];
          segment.fillerwords.push(annotation.data);
          break;
        case 'repetition':
          if (!segment.repetitions) segment.repetitions = [];
          segment.repetitions.push(annotation.data);
          break;
        // ... handle other types
      }
    });
    
    onTranscriptChange(updatedSegments);
    closeAnnotationCreationPopup();
  }, [transcriptData, onTranscriptChange, closeAnnotationCreationPopup]);

  return {
    // State
    selectedWords,
    showAnnotationCreationPopup,
    annotationCreationPosition,
    
    // Actions
    handleWordSelection,
    clearWordSelection,
    openAnnotationCreationPopup,
    closeAnnotationCreationPopup,
    handleWordRightClick,
    getWordAnnotations,
    handleAnnotationClick,
    handlePauseClick,
    handleAddAnnotation,
    handleRemoveAnnotation,
    handleConvertAnnotation,
    saveNewAnnotations
  };
};
