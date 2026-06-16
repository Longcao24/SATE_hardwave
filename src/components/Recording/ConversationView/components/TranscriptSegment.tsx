import React from "react";
import {
  Play,
  Edit2,
  Scissors,
  Plus,
  Trash2,
  User,
  CheckSquare,
  Square,
  Merge,
  X,
  RotateCcw,
  Pause,
} from "lucide-react";
import { type Segment, type Word } from "@/services/dataService";
import { annotationColors } from "@/lib/annotationColors";
import styles from "../ConversationView.module.css";
import NoteSection from "./NoteSection";

interface TranscriptSegmentProps {
  segment: Segment;
  segmentIndex: number;
  segmentId?: string;
  currentTime: number;
  onSeek: (timestamp: string) => void;
  isEditable?: boolean;
  editModes: any;
  activeFilters: string[];
  isSimpleAnnotationMode: boolean;
  selectedSegments: Set<number>;
  selectedForMerge: number[];
  selectedWords: any[];
  checkedSegments: Set<number>;
  inlineEditingSegment: number | null;
  onPlaySegment: (start: number, end?: number) => void;
  onStartEditing: (index: number) => void;
  onToggleSelection: (index: number) => void;
  onToggleMergeSelection: (index: number) => void;
  onToggleCheckbox: (index: number) => void;
  onStartSpeakerChange: () => void;
  onDeleteSegment: (index: number) => void;
  onAddNewSegment: (index: number) => void;
  onToggleExclusion: (index: number) => void;
  onSplitSegment: (segmentIndex: number, wordIndex: number) => void;
  onWordSelection: (
    segmentIndex: number,
    wordIndex: number,
    word: Word,
    event: React.MouseEvent
  ) => void;
  onWordRightClick: (
    event: React.MouseEvent,
    segmentIndex: number,
    wordIndex: number,
    word: Word,
    segment: Segment
  ) => void;
  onAnnotationClick: (
    type: string,
    segment: Segment,
    wordIndex: number,
    event: React.MouseEvent
  ) => void;
  onPauseClick: (pause: any, event: React.MouseEvent) => void;
  onStartInlineEditing: (index: number) => void;
  onSaveInlineEdit: (text: string) => void;
  onCancelInlineEdit: () => void;
  editableRef: React.RefObject<HTMLDivElement>;
  dragHandlers: any;
  isPlaying?: boolean;
  onTogglePlayPause?: () => void;
  clickedWord?: { segmentIndex: number; wordIndex: number; timestamp: number } | null;
  onWordClick?: (segmentIndex: number, wordIndex: number, word: Word) => void;
  onNoteChange?: (segmentIndex: number, note: string) => void;
}

const TranscriptSegment: React.FC<TranscriptSegmentProps> = ({
  segment,
  segmentIndex,
  segmentId,
  currentTime,
  onSeek,
  isEditable,
  editModes,
  activeFilters,
  isSimpleAnnotationMode,
  selectedSegments,
  selectedForMerge,
  selectedWords,
  checkedSegments,
  inlineEditingSegment,
  onPlaySegment,
  onStartEditing,
  onToggleSelection,
  onToggleMergeSelection,
  onToggleCheckbox,
  onStartSpeakerChange,
  onDeleteSegment,
  onAddNewSegment,
  onToggleExclusion,
  onSplitSegment,
  onWordSelection,
  onWordRightClick,
  onAnnotationClick,
  onPauseClick,
  onStartInlineEditing,
  onSaveInlineEdit,
  onCancelInlineEdit,
  editableRef,
  dragHandlers,
  isPlaying,
  onTogglePlayPause,
  clickedWord,
  onWordClick,
  onNoteChange,
}) => {
  // Check if segment is currently active
  const isSegmentActive = (segment: Segment) => {
    return currentTime >= segment.start && currentTime <= segment.end;
  };

  // Check if word is currently active
  const isWordActive = (word: {
    start?: number | null;
    end?: number | null;
  }) => {
    if (!word.start || !word.end) return false;
    return currentTime >= word.start && currentTime <= word.end;
  };

  // Format timestamp helper
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  // Get word annotations
  const getWordAnnotations = (segment: Segment, wordIndex: number) => {
    const annotations: Array<{ type: string; color: string }> = [];

    if (isSimpleAnnotationMode) {
      const redColor = "#EF4444";

      if (activeFilters.includes("filler") && segment.fillerwords) {
        const word = segment.words[wordIndex];
        const isFillerWord = segment.fillerwords.some(
          (filler) => filler.start === word.start && filler.end === word.end
        );
        if (isFillerWord) {
          annotations.push({ type: "filler", color: redColor });
        }
      }

      if (activeFilters.includes("repetition") && segment.repetitions) {
        const isInRepetition = segment.repetitions.some((rep) =>
          rep.words.includes(wordIndex)
        );
        if (isInRepetition) {
          annotations.push({ type: "repetition", color: redColor });
        }
      }

      if (activeFilters.includes("revision") && segment.revisions) {
        const isInRevision = segment.revisions.some((rev: any) => {
          const wordIndices = rev.location || rev.words || [];
          return wordIndices.includes(wordIndex);
        });
        if (isInRevision) {
          annotations.push({ type: "revision", color: redColor });
        }
      }
    } else {
      // Advanced mode with different colors
      if (activeFilters.includes("filler") && segment.fillerwords) {
        const word = segment.words[wordIndex];
        const isFillerWord = segment.fillerwords.some(
          (filler) => filler.start === word.start && filler.end === word.end
        );
        if (isFillerWord) {
          annotations.push({ type: "filler", color: annotationColors.filler });
        }
      }

      if (activeFilters.includes("repetition") && segment.repetitions) {
        const isInRepetition = segment.repetitions.some((rep) =>
          rep.words.includes(wordIndex)
        );
        if (isInRepetition) {
          annotations.push({
            type: "repetition",
            color: annotationColors.repetition,
          });
        }
      }

      if (
        activeFilters.includes("mispronunciation") &&
        segment.mispronunciation
      ) {
        const word = segment.words[wordIndex];
        const isMispronunciation = segment.mispronunciation.some(
          (mp: any) => mp.start === word.start && mp.end === word.end
        );
        if (isMispronunciation) {
          annotations.push({
            type: "mispronunciation",
            color: annotationColors.mispronunciation,
          });
        }
      }

      if (activeFilters.includes("morpheme") && segment.morphemes) {
        const word = segment.words[wordIndex];
        const hasMorpheme = segment.morphemes.some((m) => {
          const cleanWord = word.word.replace(/[.,!?;:]$/, "");
          const cleanMorphemeWord = m.word.replace(/[.,!?;:]$/, "");
          return cleanWord === cleanMorphemeWord && m.morpheme_form !== "<IRR>";
        });
        if (hasMorpheme) {
          annotations.push({
            type: "morpheme",
            color: annotationColors.morpheme,
          });
        }
      }

      if (
        activeFilters.includes("morpheme-omission") &&
        segment.morpheme_omissions
      ) {
        const word = segment.words[wordIndex];
        const hasMorphemeOmission = segment.morpheme_omissions.some(
          (omission: any) => {
            if (omission.index === wordIndex) return true;
            const cleanWord = word.word.replace(/[.,!?;:]$/, "");
            const cleanOmissionWord = omission.word.replace(/[.,!?;:]$/, "");
            return cleanWord === cleanOmissionWord;
          }
        );
        if (hasMorphemeOmission) {
          annotations.push({
            type: "morpheme-omission",
            color: annotationColors["morpheme-omission"],
          });
        }
      }

      if (activeFilters.includes("revision") && segment.revisions) {
        const isInRevision = segment.revisions.some((rev: any) => {
          const wordIndices = rev.location || rev.words || [];
          return wordIndices.includes(wordIndex);
        });
        if (isInRevision) {
          annotations.push({
            type: "revision",
            color: annotationColors.revision,
          });
        }
      }
    }

    return annotations;
  };

  
  const getPauseAfterWord = (segment: Segment, wordIndex: number) => {
    if (!isSimpleAnnotationMode && !activeFilters.includes("pause")) return null;
    if (!segment.pauses) return null;

    // First try to find pause with matching index
    const pause = segment.pauses.find((p: any) => p.index === wordIndex);

    if (pause) {
      return {
        duration: pause.duration,
        color: annotationColors.pause,
        start: pause.start,
        end: pause.end,
      };
    }

    // Fallback to timing-based matching for backward compatibility
    // Only show pause if there's actually a gap between words
    if (wordIndex >= segment.words.length - 1) return null;

    const currentWord = segment.words[wordIndex];
    const nextWord = segment.words[wordIndex + 1];

    if (!currentWord.end || !nextWord.start) return null;

    // Check if there's actually a meaningful gap between words
    const gapDuration = nextWord.start - currentWord.end;
    if (gapDuration <= 0.1) return null; // No meaningful gap

    const pauseByTiming = segment.pauses.find((p: any) => {
      const pauseStartsAfterCurrentWord =
        p.start >= (currentWord.end || 0) - 0.1;
      const pauseEndsBeforeNextWord = p.end <= (nextWord.start || 0) + 0.1;
      return pauseStartsAfterCurrentWord && pauseEndsBeforeNextWord;
    });

    return pauseByTiming
      ? {
          duration: pauseByTiming.duration,
          color: annotationColors.pause,
          start: pauseByTiming.start,
          end: pauseByTiming.end,
        }
      : null;
  };

  // Get pause before segment
  const getPauseBeforeSegment = (segment: Segment) => {
    if (!isSimpleAnnotationMode && !activeFilters.includes("pause")) return null;
    if (!segment.pauses || segment.words.length === 0) return null;

    console.log('[getPauseBeforeSegment] Checking pauses:', {
      segmentText: segment.text.substring(0, 50),
      pauses: segment.pauses,
      hasIndexMinus1: segment.pauses.some((p: any) => p.index === -1)
    });

    // First try to find pause with index -1 (before any words)
    const pauseBeforeFirstWord = segment.pauses.find(
      (p: any) => p.index === -1
    );

    if (pauseBeforeFirstWord) {
      console.log('[getPauseBeforeSegment] Found pause with index -1:', pauseBeforeFirstWord);
      return {
        duration: pauseBeforeFirstWord.duration,
        color: annotationColors.pause,
        start: pauseBeforeFirstWord.start,
        end: pauseBeforeFirstWord.end,
      };
    }

    // Fallback to timing-based matching for backward compatibility
    const firstWord = segment.words[0];
    if (!firstWord.start) return null;

    // Check if there's actually a meaningful gap before the first word
    const gapBeforeFirstWord = firstWord.start - segment.start;
    if (gapBeforeFirstWord <= 0.1) return null; // No meaningful gap

    const pauseByTiming = segment.pauses.find((p: any) => {
      const pauseEndsAtFirstWord =
        Math.abs(p.end - (firstWord.start || 0)) < 0.1;
      return pauseEndsAtFirstWord;
    });

    if (!pauseByTiming) {
      const pausesInRange = segment.pauses.filter((p: any) => {
        const startsAfterSegmentStart = p.start >= segment.start;
        const endsBeforeFirstWord = p.end <= (firstWord.start || 0);
        return startsAfterSegmentStart && endsBeforeFirstWord;
      });

      if (pausesInRange.length > 0) {
        const latestPause = pausesInRange.reduce((latest: any, current: any) =>
          current.end > latest.end ? current : latest
        );
        return {
          duration: latestPause.duration,
          color: annotationColors.pause,
          start: latestPause.start,
          end: latestPause.end,
        };
      }

      return null;
    }

    return pauseByTiming
      ? {
          duration: pauseByTiming.duration,
          color: annotationColors.pause,
          start: pauseByTiming.start,
          end: pauseByTiming.end,
        }
      : null;
  };

  // Handle pause segments specially
  if (segment.speaker === "PAUSE") {
    const isActive = isSegmentActive(segment);
    const pauseDuration =
      segment.pauses && segment.pauses.length > 0
        ? segment.pauses[0].duration
        : segment.end - segment.start;

    return (
      <div data-segment-id={segmentId}>
        <div
          className={`${styles.pauseSegment} ${isActive ? styles.active : ""} ${
            segment.excluded ? styles.excluded : ""
          }`}
          onClick={() => onSeek(segment.start.toString())}
        >
          <div className={styles.pauseContent}>
            <div className={styles.pauseIcon}>
              <Pause className="w-4 h-4" />
            </div>
            <div className={styles.pauseInfo}>
              <span className={styles.pauseDuration}>
                {pauseDuration.toFixed(2)}s
              </span>
              <span className={styles.pauseLabel}>Pause</span>
            </div>
            <div className={styles.pauseTime}>
              {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
            </div>

            {isEditable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExclusion(segmentIndex);
                }}
                className={`${styles.excludeBtn} ${
                  segment.excluded ? styles.excluded : ""
                }`}
                title={
                  segment.excluded
                    ? "Include in analysis"
                    : "Exclude from analysis"
                }
              >
                {segment.excluded ? (
                  <RotateCcw className="w-3 h-3" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>
        {editModes.editMode && isEditable && (
          <div className={styles.pauseEditControls}>
            <button
              onClick={() => onDeleteSegment(segmentIndex)}
              className={styles.deleteBtn}
              title="Delete this pause segment"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Regular segment handling
  const hasUtteranceError =
    activeFilters.includes("utterance-error") &&
    segment["utterance-error"] &&
    segment["utterance-error"].length > 0;

  const isActive = isSegmentActive(segment);
  const isEditing = false; // Popup editing, no inline editing
  const { splittingSegment } = editModes;

  return (
    <div data-segment-id={segmentId}>
      <div
        className={`${styles.conversationSegment} ${
          hasUtteranceError ? styles.utteranceError : ""
        } ${isEditing ? styles.editing : ""} ${isActive ? styles.active : ""} ${
          segment.excluded ? styles.excluded : ""
        } ${
          editModes.mergeMode && selectedForMerge.includes(segmentIndex)
            ? styles.selectedForMerge
            : ""
        } ${
          isEditable &&
          !editModes.selectionMode &&
          !editModes.mergeMode &&
          !editModes.annotationMode &&
          !editModes.excludeMode
            ? styles.editModeActive
            : ""
        } ${editModes.splitMode ? styles.splitModeActive : ""} ${
          editModes.excludeMode ? styles.excludeModeActive : ""
        } ${
          dragHandlers.draggedSegment === segmentIndex ? styles.dragging : ""
        } ${
          dragHandlers.dragOverSegment === segmentIndex ? styles.dragOver : ""
        }`}
        draggable={
          isEditable &&
          !editModes.selectionMode &&
          !editModes.mergeMode &&
          !editModes.annotationMode &&
          !editModes.excludeMode &&
          segment.speaker !== "PAUSE"
        }
        onDragStart={(e) => dragHandlers.handleDragStart(e, segmentIndex)}
        onDragEnd={dragHandlers.handleDragEnd}
        onDragOver={(e) => dragHandlers.handleDragOver(e, segmentIndex)}
        onDragLeave={dragHandlers.handleDragLeave}
        onDrop={(e) => dragHandlers.handleDrop(e, segmentIndex)}
        onClick={
          editModes.mergeMode
            ? () => onToggleMergeSelection(segmentIndex)
            : editModes.splitMode
            ? () => editModes.toggleSplitMode(segmentIndex)
            : editModes.excludeMode
            ? () => onToggleExclusion(segmentIndex)
            : hasUtteranceError && !isEditing
            ? (e) => {
                onAnnotationClick("utterance-error", segment, -1, e);
              }
            : undefined
        }
        onDoubleClick={
          isEditable &&
          !editModes.selectionMode &&
          !editModes.mergeMode &&
          !editModes.annotationMode &&
          !editModes.excludeMode &&
          !dragHandlers.draggedSegment
            ? (e) => {
                e.stopPropagation();
                onStartInlineEditing(segmentIndex);
              }
            : undefined
        }
        style={{
          cursor:
            isEditable &&
            !editModes.selectionMode &&
            !editModes.mergeMode &&
            !editModes.annotationMode &&
            !editModes.excludeMode &&
            !dragHandlers.draggedSegment
              ? segment.speaker !== "PAUSE"
                ? "grab"
                : "default"
              : isEditable && dragHandlers.draggedSegment === segmentIndex
              ? "grabbing"
              : editModes.mergeMode
              ? "pointer"
              : editModes.splitMode
              ? "pointer"
              : editModes.excludeMode
              ? "pointer"
              : hasUtteranceError && !isEditing
              ? "pointer"
              : "default",
        }}
      >
        <div className={styles.segmentInfo}>
          <div className={styles.header}>
            <div className={styles.speakerSection}>
              <button
                onClick={() => onPlaySegment(segment.start, segment.end)}
                className={styles.playBtn}
                title="Play this segment only"
              >
                <Play className="w-4 h-4" />
              </button>

              {isEditable &&
                !editModes.selectionMode &&
                !editModes.mergeMode &&
                !editModes.annotationMode &&
                !editModes.splitMode &&
                !editModes.excludeMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCheckbox(segmentIndex);
                    }}
                    className={`${styles.segmentCheckbox} ${
                      checkedSegments.has(segmentIndex) ? styles.checked : ""
                    }`}
                    title={
                      checkedSegments.has(segmentIndex)
                        ? "Uncheck segment"
                        : "Check segment"
                    }
                  >
                    {checkedSegments.has(segmentIndex) ? (
                      <CheckSquare size={16} className="text-blue-600" />
                    ) : (
                      <Square size={16} className="text-gray-400" />
                    )}
                  </button>
                )}

              {isEditable && editModes.selectionMode && (
                <button
                  onClick={() => onToggleSelection(segmentIndex)}
                  className={`${styles.selectionCheckbox} ${
                    selectedSegments.has(segmentIndex) ? styles.selected : ""
                  }`}
                  title={
                    selectedSegments.has(segmentIndex)
                      ? "Deselect segment"
                      : "Select segment"
                  }
                >
                  {selectedSegments.has(segmentIndex) ? (
                    <CheckSquare size={16} />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              )}

              {isEditable && editModes.mergeMode && (
                <button
                  onClick={() => onToggleMergeSelection(segmentIndex)}
                  className={`${styles.mergeCheckbox} ${
                    selectedForMerge.includes(segmentIndex)
                      ? styles.selected
                      : ""
                  }`}
                  title={
                    selectedForMerge.includes(segmentIndex)
                      ? "Deselect for merge"
                      : "Select for merge"
                  }
                  disabled={
                    !selectedForMerge.includes(segmentIndex) &&
                    selectedForMerge.length >= 2
                  }
                >
                  <Merge size={16} />
                </button>
              )}

              <span
                className={`${styles.speaker} ${
                  (editModes.selectionMode &&
                    selectedSegments.has(segmentIndex)) ||
                  (editModes.mergeMode &&
                    selectedForMerge.includes(segmentIndex))
                    ? styles.selected
                    : ""
                }`}
                onClick={
                  editModes.selectionMode
                    ? () => onToggleSelection(segmentIndex)
                    : editModes.mergeMode
                    ? () => onToggleMergeSelection(segmentIndex)
                    : undefined
                }
                style={{
                  cursor:
                    editModes.selectionMode || editModes.mergeMode
                      ? "pointer"
                      : "default",
                }}
              >
                {/* {segment.excluded && isEditable && (
                  <span 
                    className={styles.excludedIndicator}
                    title="This utterance is excluded from analysis (will show as +Speaker in SALT export)"
                  >
                    (+)
                  </span>
                )} */}
                {segment.speaker}
              </span>

              {isEditable &&
                !editModes.selectionMode &&
                !editModes.mergeMode && (
                  <button
                    onClick={() => onStartSpeakerChange()}
                    className={styles.speakerBtn}
                    title="Change speaker"
                  >
                    <User size={14} />
                  </button>
                )}
            </div>

            <div className={styles.controls}>
              <span
                className={styles.time}
                onClick={() => onSeek(segment.start.toString())}
              >
                {formatTimestamp(segment.start)} -{" "}
                {formatTimestamp(segment.end)}
              </span>

              {isEditable &&
                !editModes.selectionMode &&
                !editModes.mergeMode &&
                !editModes.annotationMode &&
                !editModes.excludeMode && (
                  <div className={styles.editControls}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExclusion(segmentIndex);
                      }}
                      className={`${styles.excludeBtn} ${
                        segment.excluded ? styles.excluded : ""
                      }`}
                      title={
                        segment.excluded
                          ? "Include in analysis"
                          : "Exclude from analysis"
                      }
                    >
                      {segment.excluded ? (
                        <RotateCcw className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      onClick={() => onStartEditing(segmentIndex)}
                      className={`${styles.editBtn} ${styles.active}`}
                      title="Edit this segment"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() =>
                        editModes.toggleSplittingSegment(segmentIndex)
                      }
                      className={`${styles.splitBtn} ${
                        splittingSegment === segmentIndex ? styles.active : ""
                      }`}
                      title={
                        splittingSegment === segmentIndex
                          ? "Cancel split"
                          : "Split segment"
                      }
                    >
                      <Scissors className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => onAddNewSegment(segmentIndex)}
                      className={styles.addBtn}
                      title="Add new segment after this one"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    <button
                      onClick={() => onDeleteSegment(segmentIndex)}
                      className={styles.deleteBtn}
                      title="Delete this segment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>

        <div
          className={`${styles.segmentText} ${
            isEditable ? styles.editable : ""
          } ${inlineEditingSegment === segmentIndex ? styles.editing : ""}`}
          onDoubleClick={(e) => {
            // Prevent double-click from bubbling up to segment container
            e.stopPropagation();
            if (
              isEditable &&
              !editModes.selectionMode &&
              !editModes.mergeMode &&
              !editModes.splitMode &&
              !editModes.annotationMode &&
              !editModes.excludeMode
            ) {
              onStartInlineEditing(segmentIndex);
            }
          }}
        >
          {splittingSegment === segmentIndex && (
            <div className={styles.splitInstructions}>
              💡 Click between any two words to split the segment at that point
            </div>
          )}

          {/* Inline editing mode */}
          {inlineEditingSegment === segmentIndex ? (
            <>
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const text = editableRef.current?.textContent || "";
                    onSaveInlineEdit(text);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelInlineEdit();
                  }
                }}
                style={{
                  whiteSpace: "pre-wrap",
                  outline: "none",
                  minHeight: "1.5em",
                }}
              />
              <div className={styles.inlineEditToolbar}>
                <button
                  onClick={() => {
                    const text = editableRef.current?.textContent || "";
                    onSaveInlineEdit(text);
                  }}
                  className={`${styles.inlineEditBtn} ${styles.save}`}
                >
                  Save
                </button>
                <button
                  onClick={onCancelInlineEdit}
                  className={`${styles.inlineEditBtn} ${styles.cancel}`}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              

              {/* Pause at the beginning of segment */}
              {(() => {
                const pauseBefore = getPauseBeforeSegment(segment);
                if (pauseBefore) {
                  return (
                    <span
                      className={styles.pauseAnnotation}
                      style={{
                        color: pauseBefore.color,
                        fontWeight: "bold",
                        margin: "0 4px 0 0",
                        cursor: "pointer",
                        borderRadius: "4px",
                        padding: "2px 4px",
                        backgroundColor: `${pauseBefore.color}20`,
                      }}
                      title={`Click to view pause details: ${pauseBefore.duration}s`}
                      onClick={(e) => {
                        e.stopPropagation();
                        
                        if (pauseBefore.start && pauseBefore.end) {
                          onPauseClick(
                            {
                              duration: pauseBefore.duration,
                              start: pauseBefore.start,
                              end: pauseBefore.end,
                              color: annotationColors.pause,
                            },
                            e
                          );
                        } 
                      }}
                    >
                      [{pauseBefore.duration.toFixed(2)}s]
                    </span>
                  );
                }
                return null;
              })()}

              {segment.words.map((word, wordIndex) => {
                const annotations = getWordAnnotations(segment, wordIndex);
                const pauseAfter = getPauseAfterWord(segment, wordIndex);
                const isActiveByTime = isWordActive(word);
                const isClickedWord = clickedWord?.segmentIndex === segmentIndex && clickedWord?.wordIndex === wordIndex;
                const isActive = isActiveByTime || isClickedWord;
                const isSelected =
                  editModes.annotationMode &&
                  selectedWords?.some(
                    (w) =>
                      w.segmentIndex === segmentIndex &&
                      w.wordIndex === wordIndex
                  );

                return (
                  <React.Fragment key={wordIndex}>
                    <span
                      className={`${styles.word} ${
                        annotations.length > 0 ? styles.annotated : ""
                      } ${isActive ? styles.active : ""} ${
                        isSelected ? styles.selected : ""
                      } ${isEditable ? styles.hasContextMenu : ""}`}
                      onClick={(e) => {
                        if (editModes.annotationMode) {
                          onWordSelection(segmentIndex, wordIndex, word, e);
                        } else if (annotations.length > 0) {
                          
                          if (onWordClick) {
                            onWordClick(segmentIndex, wordIndex, word);
                          }
                          onAnnotationClick(
                            annotations[0].type,
                            segment,
                            wordIndex,
                            e
                          );
                        } else if (
                          word.start !== undefined &&
                          word.start !== null
                        ) {
                          
                          if (onWordClick) {
                            onWordClick(segmentIndex, wordIndex, word);
                          }
                          
                          
                          onSeek(word.start.toString());
                          
                          
                          if (!isPlaying && onTogglePlayPause) {
                            onTogglePlayPause();
                          }
                        }
                      }}
                      onContextMenu={(e) => {
                        if (isEditable) {
                          onWordRightClick(
                            e,
                            segmentIndex,
                            wordIndex,
                            word,
                            segment
                          );
                        }
                      }}
                      style={{
                        cursor: editModes.annotationMode
                          ? "pointer"
                          : annotations.length > 0 || word.start
                          ? "pointer"
                          : "default",
                        
                        ...(annotations.length > 0 &&
                          !isActive &&
                          !isSelected && {
                            backgroundColor: `${annotations[0].color}20`,
                            borderBottom:
                              annotations.length === 1
                                ? `2px solid ${annotations[0].color}`
                                : `3px solid transparent`,
                            borderImage:
                              annotations.length > 1
                                ? `linear-gradient(to right, ${annotations
                                    .map((a) => a.color)
                                    .join(", ")}) 1`
                                : "none",
                            boxShadow:
                              annotations.length > 1
                                ? `0 2px 0 0 ${annotations[0].color}, 0 3px 0 0 ${annotations[1].color}`
                                : "none",
                          }),
                      }}
                      title={
                        editModes.annotationMode
                          ? `Click to ${
                              isSelected ? "deselect" : "select"
                            } word for annotation`
                          : annotations.length > 0
                          ? `${
                              annotations.length > 1
                                ? `Multiple annotations (${annotations.length}): `
                                : ""
                            }${annotations
                              .map((a) => a.type)
                              .join(", ")} - Click to view details`
                          : word.start
                          ? "Click to play from here"
                          : ""
                      }
                    >
                      {word.word.replace(/\[\d+\.\d+s\]/g, "").trim()}
                    </span>

                    {/* Split indicator when in split mode */}
                    {splittingSegment === segmentIndex &&
                      wordIndex < segment.words.length - 1 && (
                        <span
                          className={styles.splitPoint}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSplitSegment(segmentIndex, wordIndex);
                          }}
                          title={`Split after "${word.word}"`}
                        >
                          |
                        </span>
                      )}

                    {pauseAfter && (
                      <span
                        className={styles.pauseAnnotation}
                        style={{
                          color: pauseAfter.color,
                          fontWeight: "bold",
                          margin: "0 4px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          padding: "2px 4px",
                        }}
                        title={`Click to view pause details: ${pauseAfter.duration}s`}
                        onClick={(e) => {

                          e.stopPropagation();
                          
                          // Use pause index for more accurate matching
                          const pause = segment.pauses?.find(
                            (p) => p.index === wordIndex
                          );
                          
                          if (pause) {
                            onPauseClick(
                              {
                                duration: pause.duration,
                                start: pause.start,
                                end: pause.end,
                                color: annotationColors.pause,
                              },
                              e
                            );
                          } else {
                            onPauseClick(
                              {
                                duration: pauseAfter.duration,
                                start: pauseAfter.start,
                                end: pauseAfter.end,
                                color: pauseAfter.color,
                              },
                              e
                            );
                          }
                        }}
                      >
                        [{pauseAfter.duration.toFixed(2)}s]
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        {/* Note Section */}
        {segment.speaker !== "PAUSE" && (
          <NoteSection
            note={segment.note}
            isEditable={Boolean(isEditable)}
            onNoteChange={(note) => onNoteChange?.(segmentIndex, note)}
          />
        )}
      </div>
    </div>
  );
};

export default TranscriptSegment;
