import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  AlertTriangle, 
  // Filter, 
  Activity,

  PanelRight,
  ChartColumn
} from 'lucide-react';
import { type IssueCounts, type Segment } from '@/services/dataService';
import { getBackgroundColor,  getAnnotationLabel, getAnnotationDescription } from '@/lib/annotationColors';
import { calculateSpeakerVocd } from '@/utils/vocdCalculator';

import { type SpeechAnalysis } from '@/services/dataService';

interface RightSidebarProps {
  visible: boolean;
  collapsed?: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  issueCounts: IssueCounts;
  duration: number;
  transcriptData: Segment[];
  activeFilters: string[];
  speechAnalysis?: SpeechAnalysis;
  selectedSpeaker?: string;
  onSpeakerChange?: (speaker: string) => void;
  width?: number;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ 
  visible, 
  collapsed = false,
  onToggle,
  activeTab, 
  onTabChange, 
  // issueCounts, 
  transcriptData, 
  
  
  selectedSpeaker,
  onSpeakerChange,
  width = 320
}) => {
  const collapsedWidth = 70; // Width when collapsed
  const actualWidth = collapsed ? collapsedWidth : width;
  const [chartHovered, setChartHovered] = useState(false);

  // Reset chartHovered when collapsed state changes
  useEffect(() => {
    setChartHovered(false);
  }, [collapsed]);
  // Filter out excluded segments first
  const includedSegments = transcriptData.filter(segment => !segment.excluded);
  
  // Get all available speakers from non-excluded segments
  const allSpeakers = Array.from(new Set(includedSegments.map(segment => segment.speaker)));
  
  // Calculate utterance counts for each speaker to determine default
  const speakerUtteranceCounts = allSpeakers.reduce((counts, speaker) => {
    counts[speaker] = includedSegments.filter(segment => segment.speaker === speaker).length;
    return counts;
  }, {} as Record<string, number>);
  
  // Get default speaker (speaker with most utterances)
  const defaultSpeaker = allSpeakers.reduce((maxSpeaker, speaker) => 
    speakerUtteranceCounts[speaker] > speakerUtteranceCounts[maxSpeaker] ? speaker : maxSpeaker
  , allSpeakers[0] || '');
  
  // Use selected speaker or default
  const currentSpeaker = selectedSpeaker || defaultSpeaker;
  
  // Filter transcript data by selected speaker (excluding excluded segments)
  const speakerTranscriptData = includedSegments.filter(segment => segment.speaker === currentSpeaker);
  
  // Calculate speaker-specific issue counts or use global analysis
  const getDisplayIssueCounts = () => {
    // Always calculate speaker-specific issue counts for the current speaker
    // This ensures consistency with other calculations that use currentSpeaker
    const speakerIssueCounts = {
      pause: 0,
      filler: 0,
      repetition: 0,
      mispronunciation: 0,
      morpheme: 0,
      'morpheme-omission': 0,
      revision: 0,
      'utterance-error': 0
    };
    
    speakerTranscriptData.forEach(segment => {
      if (segment.fillerwords) speakerIssueCounts.filler += segment.fillerwords.length;
      if (segment.repetitions) speakerIssueCounts.repetition += segment.repetitions.length;
      if (segment.pauses) speakerIssueCounts.pause += segment.pauses.length;
      if (segment['utterance-error']) speakerIssueCounts['utterance-error'] += segment['utterance-error'].length;
      if (segment.mispronunciation) speakerIssueCounts.mispronunciation += segment.mispronunciation.length;
      if (segment.morpheme_omissions) speakerIssueCounts['morpheme-omission'] += segment.morpheme_omissions.length;
      if (segment.morphemes) {
        const visibleMorphemes = segment.morphemes.filter((morpheme: any) => 
          morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>'
        );
        speakerIssueCounts.morpheme += visibleMorphemes.length;
      }
      if (segment.revisions) speakerIssueCounts.revision += segment.revisions.length;
    });
    
    return speakerIssueCounts;
  };

  const displayIssueCounts = getDisplayIssueCounts();
  
  // Calculate total issues for selected speaker
  // const totalIssues = Object.values(displayIssueCounts).reduce((sum, count) => sum + count, 0);
  
  // Helper function to check if a word is a maze word (filler, repetition, or revision) or punctuation
  const isMazeWordOrPunctuation = (word: any, segment: any, wordPositionIndex?: number): boolean => {
    const wordText = word.word;
    // Use word.index if available, otherwise fall back to positional index
    const wordIndex = word.index ?? wordPositionIndex;
    
    // Check for basic punctuation and empty content
    const cleanWord = wordText.toLowerCase().replace(/[.,!?;:]/g, '');
    if (!cleanWord || /^[.,!?;:]+$/.test(wordText) || wordText.includes('[') || wordText.includes(']')) {
      return true;
    }
    
    // Check if word is annotated as a filler word
    // Use multiple matching strategies: time-based, content-based, and index-based
    if (segment.fillerwords && segment.fillerwords.length > 0) {
      const timeTolerance = 0.05; // 50ms tolerance for floating-point comparison
      const isFillerWord = segment.fillerwords.some((filler: any) => {
        // Match by timing with tolerance
        if (word.start !== null && word.end !== null && 
            filler.start !== null && filler.end !== null) {
          const startMatch = Math.abs(filler.start - word.start) < timeTolerance;
          const endMatch = Math.abs(filler.end - word.end) < timeTolerance;
          if (startMatch && endMatch) return true;
        }
        // Match by content (only if filler has non-empty content)
        if (filler.content && filler.content.trim() !== '' && 
            cleanWord === filler.content.toLowerCase().replace(/[.,!?;:]/g, '')) {
          return true;
        }
        // Match by index if available
        if (typeof filler.index === 'number' && filler.index === wordIndex) {
          return true;
        }
        return false;
      });
      if (isFillerWord) return true;
    }
    
    // Check if word is annotated as a repetition
    // Repetitions use 'words' array containing word indices
    if (segment.repetitions && wordIndex !== undefined) {
      const isRepetition = segment.repetitions.some((rep: any) => {
        return rep.words && 
               Array.isArray(rep.words) && 
               rep.words.includes(wordIndex);
      });
      if (isRepetition) return true;
    }
    
    // Check if word is annotated as a revision (also a maze word)
    // Revisions use 'words' or 'location' array containing word indices
    if (segment.revisions && wordIndex !== undefined) {
      const isRevision = segment.revisions.some((rev: any) => {
        const wordIndices = rev.location || rev.words || [];
        return Array.isArray(wordIndices) && wordIndices.includes(wordIndex);
      });
      if (isRevision) return true;
    }
    
    // Keep commonly known filler words as backup (in case not annotated)
    if (cleanWord === 'um' || cleanWord === 'uh' || cleanWord === 'uh-huh' || cleanWord === 'mm-hmm') {
      return true;
    }
    
    return false;
  };

  // Calculate total words (excluding maze words and punctuation) for selected speaker
  const calculateTotalWords = () => {
    // Always calculate for the current speaker to ensure consistency
    if (!speakerTranscriptData) return 0;
    
    return speakerTranscriptData.reduce((count, segment) => {
      return count + segment.words.filter((word, idx) => !isMazeWordOrPunctuation(word, segment, idx)).length;
    }, 0);
  };

  const totalWords = calculateTotalWords();
  
  // Calculate total words including maze words for selected speaker
  const calculateTotalWordsIncludingMazes = () => {
    // Always calculate for the current speaker to ensure consistency
    if (!speakerTranscriptData) return 0;
    
    // Count all words including maze words and punctuation for the selected speaker
    return speakerTranscriptData.reduce((count, segment) => {
      return count + segment.words.length;
    }, 0);
  };

  const totalWordsIncludingMazes = calculateTotalWordsIncludingMazes();
  
  // Calculate elapsed time (total duration) of utterances included in analysis for selected speaker
  const calculateElapsedTime = () => {
    // Always calculate for the current speaker to ensure consistency
    if (!speakerTranscriptData) return 0;
    
    // Calculate duration for selected speaker's included utterances
    return speakerTranscriptData.reduce((total, segment) => {
      return total + (segment.end - segment.start);
    }, 0);
  };

  const elapsedTime = calculateElapsedTime();
  
  // Calculate Moving-Average metrics
  const calculateMovingAverageMetrics = (windowSize: number = 100) => {
    // Always use speakerTranscriptData for the current speaker to ensure consistency
    const targetData = speakerTranscriptData;
    
    if (!targetData || targetData.length === 0) {
      return {
        movingAvgNTW: windowSize,
        movingAvgNDW: 0,
        movingAvgTTR: 0
      };
    }
    
    // Collect all words (excluding maze words) in order
    const allWords: string[] = [];
    targetData.forEach(segment => {
      segment.words.forEach((word, idx) => {
        if (!isMazeWordOrPunctuation(word, segment, idx)) {
          const cleanWord = word.word.toLowerCase().replace(/[.,!?;:]/g, '');
          if (cleanWord) {
            allWords.push(cleanWord);
          }
        }
      });
    });
    
    if (allWords.length < windowSize) {
      // If we don't have enough words for the window size, use all available words
      const uniqueWords = new Set(allWords);
      return {
        movingAvgNTW: allWords.length,
        movingAvgNDW: uniqueWords.size,
        movingAvgTTR: allWords.length > 0 ? uniqueWords.size / allWords.length : 0
      };
    }
    
    // Calculate NDW for each moving window
    const ndwValues: number[] = [];
    for (let i = 0; i <= allWords.length - windowSize; i++) {
      const windowWords = allWords.slice(i, i + windowSize);
      const uniqueWordsInWindow = new Set(windowWords);
      ndwValues.push(uniqueWordsInWindow.size);
    }
    
    // Calculate Moving-Average NDW
    const movingAvgNDW = ndwValues.length > 0 ? 
      ndwValues.reduce((sum, ndw) => sum + ndw, 0) / ndwValues.length : 0;
    
    // Moving-Average NTW is the window size
    const movingAvgNTW = windowSize;
    
    // Moving-Average TTR
    const movingAvgTTR = movingAvgNTW > 0 ? movingAvgNDW / movingAvgNTW : 0;
    
    return {
      movingAvgNTW,
      movingAvgNDW,
      movingAvgTTR
    };
  };

  const movingAverageMetrics = calculateMovingAverageMetrics(100);
  
  // Get list of different words (lemmas for non-irregular morphemes, words for others)
  const getDifferentWordsList = () => {
    // Always use speakerTranscriptData for the current speaker to ensure consistency
    const targetData = speakerTranscriptData;
    
    if (!targetData) return [];
    
    const differentWords = new Set<string>();
    
    targetData.forEach(segment => {
      segment.words.forEach((word, idx) => {
        if (!isMazeWordOrPunctuation(word, segment, idx)) {
          const cleanWord = word.word.toLowerCase().replace(/[.,!?;:]/g, '');
          if (cleanWord) {
            // Check if this word has a morpheme annotation with non-IRR morpheme_form
            const morpheme = segment.morphemes?.find((m: any) => {
              const cleanWordForComparison = word.word.replace(/[.,!?;:]$/, '');
              const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
              return cleanWordForComparison === cleanMorphemeWord;
            });
            
            if (morpheme && morpheme.lemma && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') {
              // Use lemma for words with non-irregular morphemes
              differentWords.add(morpheme.lemma.toLowerCase());
            } else {
              // Use the word itself for other cases
              differentWords.add(cleanWord);
            }
          }
        }
      });
    });
    
    return Array.from(differentWords).sort();
  };

  // Calculate NDW (Number of Different Words) for selected speaker
  const calculateNDW = () => {
    // Always calculate for the current speaker to ensure consistency
    const differentWordsList = getDifferentWordsList();
    return differentWordsList.length;
  };

  const ndw = calculateNDW();
  
  // Calculate TTR (Type-Token Ratio)
  const ttr = totalWords > 0 ? ndw / totalWords : 0;
  
  // Helper function to split a segment into utterances based on sentence boundaries
  const splitSegmentIntoUtterances = (segment: any): Array<{words: any[], morphemes?: any[]}> => {
    const utterances: Array<{words: any[], morphemes?: any[]}> = [];
    let currentUtterance: any[] = [];
    
    segment.words.forEach((word: any) => {
      currentUtterance.push(word);
      
      // Check if this word ends a sentence (contains period, question mark, or exclamation)
      if (word.word.includes('.') || word.word.includes('?') || word.word.includes('!')) {
        // Only create utterance if it has meaningful words (not just punctuation/fillers)
        const meaningfulWords = currentUtterance.filter((w: any) => 
          !isMazeWordOrPunctuation(w, segment)
        );
        
        if (meaningfulWords.length > 0) {
          // Find morphemes that belong to this utterance
          const utteranceMorphemes = segment.morphemes?.filter((morpheme: any) => {
            return currentUtterance.some(utteranceWord => {
              const cleanUtteranceWord = utteranceWord.word.replace(/[.,!?;:]$/, '');
              const cleanMorphemeWord = morpheme.word.replace(/[.,!?;:]$/, '');
              return cleanUtteranceWord === cleanMorphemeWord;
            });
          }) || [];
          
          utterances.push({
            words: [...currentUtterance],
            morphemes: utteranceMorphemes
          });
        }
        
        currentUtterance = [];
      }
    });
    
    // Add remaining words as final utterance if any
    if (currentUtterance.length > 0) {
      const meaningfulWords = currentUtterance.filter((w: any) => 
        !isMazeWordOrPunctuation(w, segment)
      );
      
      if (meaningfulWords.length > 0) {
        const utteranceMorphemes = segment.morphemes?.filter((morpheme: any) => {
          return currentUtterance.some(utteranceWord => {
            const cleanUtteranceWord = utteranceWord.word.replace(/[.,!?;:]$/, '');
            const cleanMorphemeWord = morpheme.word.replace(/[.,!?;:]$/, '');
            return cleanUtteranceWord === cleanMorphemeWord;
          });
        }) || [];
        
        utterances.push({
          words: [...currentUtterance],
          morphemes: utteranceMorphemes
        });
      }
    }
    
    return utterances;
  };

  // Calculate MLUw (Mean Length of Utterance in Words) for selected speaker
  const calculateMLUw = () => {
    if (!speakerTranscriptData || speakerTranscriptData.length === 0) return 0;
    
    // Filter to valid segments with meaningful words (non-maze words)
    const validSegments = speakerTranscriptData.filter(segment => 
      segment.words.some((word, idx) => !isMazeWordOrPunctuation(word, segment, idx))
    );
    
    if (validSegments.length === 0) return 0;
    
    // Split segments into utterances
    const allUtterances: Array<{words: any[], morphemes?: any[], segment: any}> = [];
    validSegments.forEach(segment => {
      const utterances = splitSegmentIntoUtterances(segment);
      utterances.forEach(utterance => {
        allUtterances.push({ ...utterance, segment });
      });
    });
    
    if (allUtterances.length === 0) return 0;
    
    // Count valid words across all utterances
    let totalValidWords = 0;
    allUtterances.forEach(utterance => {
      const validWords = utterance.words.filter((word, idx) => !isMazeWordOrPunctuation(word, utterance.segment, idx));
      totalValidWords += validWords.length;
    });
    
    // MLUw = total words / number of utterances
    return totalValidWords / allUtterances.length;
  };

  // Calculate MLUm (Mean Length of Utterance in Morphemes) for selected speaker  
  const calculateMLUm = () => {
    if (!speakerTranscriptData || speakerTranscriptData.length === 0) return 0;
    
    // Filter to valid segments with meaningful words (non-maze words)
    const validSegments = speakerTranscriptData.filter(segment => 
      segment.words.some((word, idx) => !isMazeWordOrPunctuation(word, segment, idx))
    );
    
    if (validSegments.length === 0) return 0;
    
    // Split segments into utterances
    const allUtterances: Array<{words: any[], morphemes?: any[], segment: any}> = [];
    validSegments.forEach(segment => {
      const utterances = splitSegmentIntoUtterances(segment);
      utterances.forEach(utterance => {
        allUtterances.push({ ...utterance, segment });
      });
    });
    
    if (allUtterances.length === 0) return 0;
    
    let totalMorphemes = 0;
    
    allUtterances.forEach(utterance => {
      let utteranceMorphemes = 0;
      
      // Count morphemes for each valid word in the utterance (excluding maze words)
      const validWords = utterance.words.filter((word, idx) => !isMazeWordOrPunctuation(word, utterance.segment, idx));
      
      validWords.forEach((validWord) => {
        // Check if this word has a morpheme annotation with non-IRR morpheme_form
        const morpheme = utterance.morphemes?.find((m: any) => {
          const cleanWord = validWord.word.replace(/[.,!?;:]$/, '');
          const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, '');
          return cleanWord === cleanMorphemeWord;
        });
        
        if (morpheme && morpheme.morpheme_form && morpheme.morpheme_form !== '<IRR>') {
          // Word with morpheme annotation (non-IRR) = 2 morphemes (lemma + morpheme_form)
          utteranceMorphemes += 2;
        } else {
          // Regular word or IRR morpheme = 1 morpheme
          utteranceMorphemes += 1;
        }
      });
      
      totalMorphemes += utteranceMorphemes;
    });
    
    // MLUm = total morphemes / number of utterances
    return totalMorphemes / allUtterances.length;
  };

  const mluw = calculateMLUw();
  const mlum = calculateMLUm();

  // Extract unique word roots (lemmas) from morpheme data (excluding maze words)
  // const getWordRoots = () => {
  //   if (!speakerTranscriptData) return [];
    
  //   const wordRoots = new Set<string>();
    
  //   speakerTranscriptData.forEach(segment => {
  //     if (segment.morphemes) {
  //       segment.morphemes.forEach((morpheme: any) => {
  //         // Only include morphemes for words that are not maze words
  //         const correspondingWord = segment.words.find((w: any) => {
  //           const cleanWord = w.word.replace(/[.,!?;:]$/, '');
  //           const cleanMorphemeWord = morpheme.word.replace(/[.,!?;:]$/, '');
  //           return cleanWord === cleanMorphemeWord;
  //         });
          
  //         if (correspondingWord && 
  //             !isMazeWordOrPunctuation(correspondingWord, segment) &&
  //             morpheme.lemma && 
  //             morpheme.morpheme_form && 
  //             morpheme.morpheme_form !== '<IRR>') {
  //           wordRoots.add(morpheme.lemma.toLowerCase());
  //         }
  //       });
  //     }
  //   });
    
  //   return Array.from(wordRoots).sort();
  // };



  // Export function to create and download a .txt file
//   const exportLanguageMetrics = () => {
//     const wordRoots = getWordRoots();
//     const differentWordsList = getDifferentWordsList();
//     const currentDate = new Date().toLocaleDateString();
//     const currentTime = new Date().toLocaleTimeString();
    
//     // Calculate D-VoCD for export (always speaker-specific for consistency)
//     const vocdResult = calculateSpeakerVocd(includedSegments, currentSpeaker, {
//       nMin: 35,
//       nMax: 50,
//       samples: 100
//     });
    
//     const dValue = vocdResult.dHat;
//     const hasEnoughTokens = vocdResult.numTokens >= 35;
//     const vocdQuality = dValue > 80 ? 'Excellent' :
//                        dValue > 50 ? 'Good' :
//                        dValue > 30 ? 'Fair' :
//                        'Limited';
    
//     const content = `Language Analysis Metrics Export
// =====================================

// Export Date: ${currentDate}
// Export Time: ${currentTime}
// Speaker: ${currentSpeaker || 'All Speakers'}

// CORE LANGUAGE METRICS
// ====================
// NTW (Number of Total Words): ${totalWords}
// NTAW (Number of Total All Words including mazes): ${totalWordsIncludingMazes}
// NDW (Number of Different Words): ${ndw}
// TNU (Total Number of Utterances): ${speakerUtteranceCounts[currentSpeaker] || 0}
// Elapsed Time (Total Duration): ${elapsedTime.toFixed(2)} seconds

// SYNTAX/MORPHOLOGY METRICS
// ========================
// MLUw (Mean Length of Utterance in Words): ${mluw.toFixed(2)}
// MLUm (Mean Length of Utterance in Morphemes): ${mlum.toFixed(2)}

// SEMANTICS METRICS
// =================
// TTR (Type-Token Ratio): ${ttr.toFixed(3)}
// Moving-Average NTW (Window Size): ${movingAverageMetrics.movingAvgNTW}
// Moving-Average NDW: ${movingAverageMetrics.movingAvgNDW.toFixed(2)}
// Moving-Average TTR: ${movingAverageMetrics.movingAvgTTR.toFixed(3)}
// D-VoCD (Vocabulary Diversity): ${hasEnoughTokens ? `${dValue.toFixed(1)} (${vocdQuality})` : `N/A (${vocdResult.numTokens} tokens, need 35+)`}

// VERBAL FLUENCY METRICS
// =====================
// Pauses per Words: ${totalWords > 0 ? (displayIssueCounts.pause / totalWords).toFixed(3) : '0.000'}
// Words per Minute: ${speechRate}
// Maze Words / Total Words: ${totalWordsIncludingMazes > 0 ? (((totalWordsIncludingMazes - totalWords) / totalWordsIncludingMazes) * 100).toFixed(1) : '0.0'}%
// Average Pause per Utterance: ${avgPausePerUtterance.toFixed(2)}s

// VOCABULARY DIVERSITY ANALYSIS (D-VoCD)
// =====================================
// Algorithm: VoCD (Vocabulary Diversity)
// Sample Size Range: 35-50 words
// Number of Samples: 100
// Total Tokens Used: ${vocdResult.numTokens}
// D-VoCD Score: ${hasEnoughTokens ? dValue.toFixed(1) : 'N/A'}
// Quality Assessment: ${hasEnoughTokens ? vocdQuality : 'Insufficient Data'}
// ${hasEnoughTokens ? `
// Interpretation:
// - Excellent (>80): Very rich vocabulary usage
// - Good (50-80): Adequate vocabulary diversity  
// - Fair (30-50): Limited vocabulary variety
// - Limited (<30): Repetitive language patterns` : ''}

// WORD ROOTS (LEMMAS) - Legacy Export
// ===================================
// Total Unique Word Roots: ${wordRoots.length}

// ${wordRoots.length > 0 ? wordRoots.map((root, index) => `${index + 1}. ${root}`).join('\n') : 'No word roots found in the morpheme data.'}

// LIST OF DIFFERENT WORDS (LEMMAS)
// ===============================
// Total Different Words: ${differentWordsList.length}
// (Lemmas for non-irregular morphemes, words for others)

// ${differentWordsList.length > 0 ? differentWordsList.map((word, index) => `${index + 1}. ${word}`).join('\n') : 'No different words found.'}

// ADDITIONAL METRICS
// =================
// Total Issues Detected: ${totalIssues}
// Total Pauses: ${displayIssueCounts.pause}
// Total Fillers: ${displayIssueCounts.filler}
// Total Repetitions: ${displayIssueCounts.repetition}
// Total Mispronunciations: ${displayIssueCounts.mispronunciation}

// =====================================
// Generated by SATE - Speech Annotation and Transcription Enhancer
// `;

//     // Create and download the file
//     const blob = new Blob([content], { type: 'text/plain' });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement('a');
//     link.href = url;
//     link.download = `speech-analysis-metrics-${currentSpeaker || 'all-speakers'}-${new Date().toISOString().split('T')[0]}.txt`;
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//     URL.revokeObjectURL(url);
//   };
  
  // Calculate Average Pause per Utterance
  const calculateAvgPausePerUtterance = () => {
    if (!speakerTranscriptData || speakerTranscriptData.length === 0) return 0;
    
    // Sum all pause durations for the speaker
    const totalPauseDuration = speakerTranscriptData.reduce((total, segment) => {
      if (segment.pauses && segment.pauses.length > 0) {
        const segmentPauseDuration = segment.pauses.reduce((segTotal: number, pause: any) => 
          segTotal + (pause.duration || 0), 0);
        return total + segmentPauseDuration;
      }
      return total;
    }, 0);
    
    // Get number of utterances for the speaker
    const utteranceCount = speakerUtteranceCounts[currentSpeaker] || 0;
    
    return utteranceCount > 0 ? totalPauseDuration / utteranceCount : 0;
  };

  const avgPausePerUtterance = calculateAvgPausePerUtterance();
  
  // Calculate speech rate for selected speaker
  const calculateSpeechRate = () => {
    if (!speakerTranscriptData || speakerTranscriptData.length === 0) return 0;
    
    // Calculate duration for selected speaker
    const speakerDuration = speakerTranscriptData.reduce((total, segment) => {
      return total + (segment.end - segment.start);
    }, 0);
    
    if (speakerDuration === 0) return 0;
    
    const wordsPerMinute = Math.round((totalWords / speakerDuration) * 60);
    return wordsPerMinute;
  };

  const speechRate = calculateSpeechRate();



  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3, color: 'gray' },
    { id: 'language', label: 'Language', icon: Activity, color: 'blue' },
    { id: 'issues', label: 'Issues', icon: AlertTriangle, color: 'red' },
    // { id: 'annotations', label: 'Filters', icon: Filter, color: 'purple' }
  ];

  return (
    <div 
      style={{ width: `${actualWidth}px` }}
      className={`bg-white border-l border-gray-200 flex flex-col h-full transition-all duration-200 overflow-hidden ${
        visible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
          {!collapsed && (
            <>
              <button
                onClick={onToggle}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Collapse sidebar"
              >
                <PanelRight className="w-5 h-5" />
              </button>
              <div className="flex-1 text-right">
                <h2 className="text-lg font-semibold text-gray-900">Language Analysis</h2>
                <p className="text-sm text-gray-600">Real-time insights</p>
              </div>
              <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200">
                <BarChart3 className="w-5 h-5 text-gray-700" />
              </div>
            </>
          )}
          {collapsed && (
            <div 
              className="relative cursor-pointer"
              onClick={onToggle}
              onMouseEnter={() => setChartHovered(true)}
              onMouseLeave={() => setChartHovered(false)}
              title="Click to expand sidebar"
            >
              <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200">
                <ChartColumn className={`w-5 h-5 text-gray-700 transition-all ${chartHovered ? 'opacity-0' : 'opacity-100'}`} />
              </div>
              {chartHovered && (
                <div className="absolute inset-0 flex items-center justify-center transition-all">
                  <PanelRight className="w-6 h-6 text-black" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed Icons - Only show when collapsed */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center py-6 gap-4 overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  onToggle(); // Expand the sidebar
                }}
                className={`p-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
                title={`${tab.label} - Click to expand`}
              >
                <Icon className="w-6 h-6" />
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded Content - Only show when not collapsed */}
      {!collapsed && (
        <>
      {/* Speaker Selection */}
      {allSpeakers.length > 1 && (
        <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="mb-2">
            <label className="text-xs font-medium text-gray-700 mb-1 block">Speaker Analysis</label>
            <select
              value={currentSpeaker}
              onChange={(e) => onSpeakerChange?.(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {allSpeakers.map(speaker => (
                <option key={speaker} value={speaker}>
                  {speaker} ({speakerUtteranceCounts[speaker]} utterances)
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500">
            Analyzing data for {currentSpeaker}
            {currentSpeaker === defaultSpeaker && ' (default)'}
          </div>
        </div>
      )}

      {/* Simple Tabs */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            const getTabColors = (color: string, active: boolean) => {
              const colors = {
                gray: {
                  active: 'text-gray-800 border-gray-600 bg-gray-50',
                  inactive: 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                },
                blue: {
                  active: 'text-blue-700 border-blue-600 bg-blue-50',
                  inactive: 'text-blue-500 border-transparent hover:text-blue-700 hover:bg-blue-50'
                },
                red: {
                  active: 'text-red-700 border-red-600 bg-red-50',
                  inactive: 'text-red-500 border-transparent hover:text-red-700 hover:bg-red-50'
                },
                purple: {
                  active: 'text-purple-700 border-purple-600 bg-purple-50',
                  inactive: 'text-purple-500 border-transparent hover:text-purple-700 hover:bg-purple-50'
                }
              };
              return active ? colors[color as keyof typeof colors].active : colors[color as keyof typeof colors].inactive;
            };
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 px-3 py-3 text-xs font-medium border-b-2 transition-all duration-200 flex flex-col items-center gap-1 ${getTabColors(tab.color, isActive)}`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
        {activeTab === 'overview' && (
          <div className="p-4 space-y-6">
            {/* Basic Metrics */}
            {/* <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Basic</h3>
                <button
                  onClick={exportLanguageMetrics}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 focus:outline-none"
                  title="Export language metrics to .txt file"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="text-xs font-medium text-teal-700 mb-1">TNU</div>
                  <div className="text-xl font-bold text-teal-800">{speakerUtteranceCounts[currentSpeaker] || 0}</div>
                  <div className="text-xs text-teal-600">Total Number of Utterances</div>
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <div className="text-xs font-medium text-indigo-700 mb-1">NTAW</div>
                  <div className="text-xl font-bold text-indigo-800">{totalWordsIncludingMazes}</div>
                  <div className="text-xs text-indigo-600">All Words (incl. mazes)</div>
                </div>
                <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-100">
                  <div className="text-xs font-medium text-cyan-700 mb-1">Elapsed Time</div>
                  <div className="text-xl font-bold text-cyan-800">{elapsedTime.toFixed(2)}s</div>
                  <div className="text-xs text-cyan-600">Total Duration</div>
                </div>
              </div>
            </div> */}

            {/* Core Language Metrics */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Core Language Metrics</h3>

              {/* PRIORITY METRICS - 4 Most Important */}
              <div className="mb-6">
                {/* <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Priority Metrics</h4> */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <div className="text-xs font-medium text-teal-700 mb-1">TNU</div>
                    <div className="text-xl font-bold text-teal-800">{speakerUtteranceCounts[currentSpeaker] || 0}</div>
                    <div className="text-xs text-teal-600">Total Utterances</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="text-xs font-medium text-blue-700 mb-1">TNW</div>
                    <div className="text-xl font-bold text-blue-800">{totalWords}</div>
                    <div className="text-xs text-blue-600">Total Words</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                    <div className="text-xs font-medium text-green-700 mb-1">NDW</div>
                    <div className="text-xl font-bold text-green-800">{ndw}</div>
                    <div className="text-xs text-green-600">Different Words</div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div className="text-xs font-medium text-orange-700 mb-1">MLUm</div>
                    <div className="text-xl font-bold text-orange-800">{mlum.toFixed(2)}</div>
                    <div className="text-xs text-orange-600">Mean Length (Morphemes)</div>
                  </div>
                </div>
              </div>
              
              {/* Additional Core Metric */}
              <div className="mb-6">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="text-xs font-medium text-amber-700 mb-1">Pauses per Words</div>
                  <div className="text-xl font-bold text-amber-800">
                    {totalWords > 0 ? (displayIssueCounts.pause / totalWords).toFixed(3) : '0.000'}
                  </div>
                  <div className="text-xs text-amber-600">Pause Rate</div>
                </div>
              </div>

              {/* SYNTAX/MORPHOLOGY Section */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">SYNTAX/MORPHOLOGY</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="text-xs font-medium text-purple-700 mb-1">MLUw</div>
                    <div className="text-xl font-bold text-purple-800">{mluw.toFixed(2)}</div>
                    <div className="text-xs text-purple-600">Mean Length (Words)</div>
                  </div>
                </div>
              </div>
              
              {/* SEMANTICS Section */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">SEMANTICS</h4>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-xs font-medium text-emerald-700 mb-1">TTR</div>
                    <div className="text-xl font-bold text-emerald-800">{ttr.toFixed(3)}</div>
                    <div className="text-xs text-emerald-600">Type-Token Ratio</div>
                  </div>
                  <div className="p-3 bg-sky-50 rounded-lg border border-sky-100">
                    <div className="text-xs font-medium text-sky-700 mb-1">Moving-Avg NTW</div>
                    <div className="text-xl font-bold text-sky-800">{movingAverageMetrics.movingAvgNTW}</div>
                    <div className="text-xs text-sky-600">Window Size</div>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                    <div className="text-xs font-medium text-rose-700 mb-1">Moving-Avg NDW</div>
                    <div className="text-xl font-bold text-rose-800">{movingAverageMetrics.movingAvgNDW.toFixed(2)}</div>
                    <div className="text-xs text-rose-600">Avg Unique Words</div>
                  </div>
                  <div className="p-3 bg-violet-50 rounded-lg border border-violet-100">
                    <div className="text-xs font-medium text-violet-700 mb-1">Moving-Avg TTR</div>
                    <div className="text-xl font-bold text-violet-800">{movingAverageMetrics.movingAvgTTR.toFixed(3)}</div>
                    <div className="text-xs text-violet-600">Avg Type-Token Ratio</div>
                  </div>
                </div>
                
                {/* D-VoCD (Vocabulary Diversity) */}
                {(() => {
                  // Calculate D-VoCD for the current speaker (always speaker-specific for consistency)
                  const vocdResult = calculateSpeakerVocd(includedSegments, currentSpeaker, {
                    nMin: 35,
                    nMax: 50,
                    samples: 100
                  });
                  
                  const dValue = vocdResult.dHat;
                  const hasEnoughTokens = vocdResult.numTokens >= 35;
                  
                  return (
                    <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 col-span-2">
                      <div className="text-xs font-medium text-indigo-700 mb-1">VOCO-D</div>
                      {hasEnoughTokens ? (
                        <>
                          <div className={`text-xl font-bold ${
                            dValue > 80 ? 'text-green-700' :
                            dValue > 50 ? 'text-indigo-800' :
                            dValue > 30 ? 'text-yellow-700' :
                            'text-red-700'
                          }`}>
                            {dValue.toFixed(1)}
                          </div>
                          <div className="text-xs text-indigo-600">
                            Vocabulary Diversity ({dValue > 80 ? 'Excellent' :
                                                 dValue > 50 ? 'Good' :
                                                 dValue > 30 ? 'Fair' :
                                                 'Limited'})
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-gray-500">N/A</div>
                          <div className="text-xs text-gray-500">
                            Insufficient data ({vocdResult.numTokens} tokens, need 35+)
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              
              
              {/* VERBAL FACILITY Section */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">VERBAL FLUENCY</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-lime-50 rounded-lg border border-lime-100">
                    <div className="text-xs font-medium text-lime-700 mb-1">Words per Minute</div>
                    <div className="text-xl font-bold text-lime-800">{speechRate}</div>
                    <div className="text-xs text-lime-600">Speech Rate</div>
                  </div>
                  <div className="p-3 bg-pink-50 rounded-lg border border-pink-100">
                    <div className="text-xs font-medium text-pink-700 mb-1">Maze Words / Total Words</div>
                    <div className="text-xl font-bold text-pink-800">
                      {totalWordsIncludingMazes > 0 ? (((totalWordsIncludingMazes - totalWords) / totalWordsIncludingMazes) * 100).toFixed(1) : '0.0'}%
                    </div>
                    <div className="text-xs text-pink-600">Maze Rate</div>
                  </div>
                </div>
              </div>

              {/* Average Pause per Utterance */}
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="text-xs font-medium text-red-700 mb-1">Avg Pause per Utterance</div>
                <div className="text-xl font-bold text-red-800">{avgPausePerUtterance.toFixed(2)}s</div>
                <div className="text-xs text-red-600">
                  {displayIssueCounts.pause} pauses / {speakerUtteranceCounts[currentSpeaker] || 0} utterances
                </div>
              </div>
            </div>

            {/* Basic Metrics */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Basic</h3>
                {/* <button
                  onClick={exportLanguageMetrics}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-200 focus:ring-offset-1 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 focus:outline-none"
                  title="Export language metrics to .txt file"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button> */}
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="text-xs font-medium text-teal-700 mb-1">TNU</div>
                  <div className="text-xl font-bold text-teal-800">{speakerUtteranceCounts[currentSpeaker] || 0}</div>
                  <div className="text-xs text-teal-600">Total Number of Utterances</div>
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <div className="text-xs font-medium text-indigo-700 mb-1">NTAW</div>
                  <div className="text-xl font-bold text-indigo-800">{totalWordsIncludingMazes}</div>
                  <div className="text-xs text-indigo-600">All Words (incl. mazes)</div>
                </div>
                <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-100">
                  <div className="text-xs font-medium text-cyan-700 mb-1">Elapsed Time</div>
                  <div className="text-xl font-bold text-cyan-800">{elapsedTime.toFixed(2)}s</div>
                  <div className="text-xs text-cyan-600">Total Duration</div>
                </div>
              </div>
            </div>

            {/* Secondary Metrics */}
            

            {/* Speech Rate Analysis */}
            {/* <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-gray-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800">Speech Rate Analysis</h3>
              </div>
              
              <div className="text-center mb-4">
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {speechRate} <span className="text-lg font-normal text-gray-600">wpm</span>
                </div>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${speechQuality.color}`}>
                  {speechQuality.label}
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-3">{speechQuality.description}</p>
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      speechRate >= 150 && speechRate <= 180 ? 'bg-green-500' :
                      speechRate >= 120 && speechRate < 150 ? 'bg-yellow-500' :
                      speechRate > 180 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((speechRate / 250) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>Optimal: 150-180</span>
                  <span>250+</span>
                </div>
              </div>
            </div> */}

            {/* Top Issues */}
            {/* {topIssues.length > 0 && (
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Most Frequent Issues</h3>
                <div className="space-y-3">
                  {topIssues.map((issue) => {
                    const Icon = issue.icon;
                    return (
                      <div key={issue.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-white">
                            <Icon className="w-4 h-4 text-gray-600" />
                          </div>
                                                     <div>
                             <span className="text-sm font-medium text-gray-700">{issue.name}</span>
                             <div className="text-xs text-gray-500">
                               {totalWords > 0 ? ((issue.count / totalWords) * 100).toFixed(1) : '0.0'}% of words
                             </div>
                           </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-800">{issue.count}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )} */}
          </div>
        )}

        {activeTab === 'language' && (
          <div className="p-4 space-y-6">
            

            {/* List of Word Roots (lemma) */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-800 mb-4">List of Word Roots (lemma)</h4>
              {(() => {
                const differentWordsList = getDifferentWordsList();
                return (
                  <div>
                    <div className="mb-3 text-xs text-gray-600">
                      Total: {differentWordsList.length} different words
                      <br />
                      {/* <span className="text-xs text-gray-500">
                        Lemmas for non-irregular morphemes, words for others
                      </span> */}
                    </div>
                    <div className="max-h-60 overflow-y-auto bg-gray-50 rounded-lg p-3 border border-gray-200">
                      {differentWordsList.length > 0 ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {differentWordsList.map((word, index) => (
                            <div key={index} className="text-sm text-gray-700 py-1 px-2 hover:bg-white rounded">
                              <span className="text-xs text-gray-500 mr-2">{index + 1}.</span>
                              {word}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="text-gray-400 mb-2">📝</div>
                          <p className="text-sm text-gray-500">No different words found</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="p-4 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">All Issues Detected</h3>
              <div className="space-y-3">
                {Object.entries(displayIssueCounts)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([type, count]) => {
                    const percentage = totalWords > 0 ? ((count / totalWords) * 100) : 0;
                    
                    return (
                      <div key={type} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full ${getBackgroundColor(type)}`}></div>
                            <span className="text-sm font-medium text-gray-800">{getAnnotationLabel(type)}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-800">{count}</div>
                            <div className="text-xs text-gray-500">{(percentage || 0).toFixed(1)}%</div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed ml-7">
                          {getAnnotationDescription(type)}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* {activeTab === 'annotations' && (
          <div className="p-4 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Active Filters</h3>
              <div className="space-y-3">
                {activeFilters.length === 0 ? (
                  <div className="text-center py-8">
                    <Filter className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No active filters</p>
                    <p className="text-xs text-gray-400 mt-1">Select filters to highlight specific annotations</p>
                  </div>
                ) : (
                  activeFilters
                    .sort((a, b) => {
                      const countA = issueCounts[a as keyof IssueCounts] || 0;
                      const countB = issueCounts[b as keyof IssueCounts] || 0;
                      return countB - countA; // Decreasing order
                    })
                    .map((filter) => {
                      const count = displayIssueCounts[filter as keyof IssueCounts] || 0;
                      const percentage = totalWords > 0 ? ((count / totalWords) * 100) : 0;
                      
                      return (
                        <div key={filter} className={`p-4 rounded-lg border ${getLightBackgroundColor(filter)} hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${getBackgroundColor(filter)}`}></div>
                              <span className="text-sm font-medium text-gray-800">{getAnnotationLabel(filter)}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-gray-800">{count}</div>
                              <div className="text-xs text-gray-500">{(percentage || 0).toFixed(1)}%</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        )} */}
      </div>
        </>
      )}
    </div>
  );
};

export default RightSidebar; 