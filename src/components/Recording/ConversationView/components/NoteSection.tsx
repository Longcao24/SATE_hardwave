import React, { useState, useEffect } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import styles from '../ConversationView.module.css';

interface NoteSectionProps {
  note?: string;
  isEditable: boolean;
  onNoteChange: (note: string) => void;
}

const NoteSection: React.FC<NoteSectionProps> = ({
  note,
  isEditable,
  onNoteChange,
}) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(note || '');

  useEffect(() => {
    setNoteText(note || '');
  }, [note]);

  const handleSaveNote = () => {
    onNoteChange(noteText);
    setIsEditingNote(false);
  };

  const handleCancelNote = () => {
    setNoteText(note || '');
    setIsEditingNote(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter or Cmd+Enter to save
      e.preventDefault();
      handleSaveNote();
    } else if (e.key === 'Escape') {
      // Escape to cancel
      e.preventDefault();
      handleCancelNote();
    }
  };

  if (!isEditable && !note) {
    // Don't show anything if not editable and no note exists
    return null;
  }

  return (
    <div className={styles.noteSection}>
      <div className={styles.noteLabel}>Note</div>
      {isEditingNote ? (
        <div className={styles.noteEditContainer}>
          <textarea
            className={styles.noteTextarea}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note for this utterance..."
            autoFocus
            rows={3}
          />
          <div className={styles.noteEditButtons}>
            <button
              onClick={handleSaveNote}
              className={`${styles.noteBtn} ${styles.noteSaveBtn}`}
              title="Save note (Ctrl+Enter)"
            >
              <Check className="w-3 h-3" />
              <span>Save</span>
            </button>
            <button
              onClick={handleCancelNote}
              className={`${styles.noteBtn} ${styles.noteCancelBtn}`}
              title="Cancel (Esc)"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.noteDisplay}>
          {note ? (
            <div className={styles.noteText}>{note}</div>
          ) : (
            <div className={styles.noteEmpty}>No note</div>
          )}
          {isEditable && (
            <button
              onClick={() => setIsEditingNote(true)}
              className={styles.noteEditBtn}
              title="Edit note"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteSection;


