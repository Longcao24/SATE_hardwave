import React, { useEffect, useRef } from 'react';
import { Trash2,  MessageSquare, Repeat,  X } from 'lucide-react';

interface WordContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  word: string;
  wordIndex: number;
  segmentIndex: number;
  existingAnnotations: Array<{ type: string; color: string }>;
  onAddAnnotation: (type: string, position?: 'before' | 'after') => void;
  onRemoveAnnotation: (type: string) => void;
  onConvertAnnotation?: (fromType: string, toType: string) => void; // Optional, kept for backward compatibility
}

const WordContextMenu: React.FC<WordContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  word,
  wordIndex: _wordIndex,
  segmentIndex: _segmentIndex,
  existingAnnotations,
  onAddAnnotation,
  onRemoveAnnotation
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const annotationTypes = [
    { type: 'filler', label: 'Filler Word', icon: MessageSquare, color: '#f59e0b' },
    { type: 'repetition', label: 'Repetition', icon: Repeat, color: '#8b5cf6' },
    // { type: 'mispronunciation', label: 'Mispronunciation', icon: Volume2, color: '#ef4444' },
    { type: 'revision', label: 'Revision', icon: X, color: '#10b981' },
    // { type: 'pause', label: 'Pause', icon: Pause, color: '#06b6d4' }
  ];

  const hasAnnotation = (type: string) => {
    return existingAnnotations.some(a => a.type === type);
  };

  // Adjust menu position to ensure it stays within viewport
  const adjustedPosition = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      adjustedPosition.x = viewportWidth - rect.width - 10;
    }
    if (rect.bottom > viewportHeight) {
      adjustedPosition.y = viewportHeight - rect.height - 10;
    }
  }

  return (
    <div
      ref={menuRef}
      className="word-context-menu"
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        zIndex: 1000
      }}
    >
      <div className="menu-header">
        <span className="word-preview">"{word}"</span>
        <button onClick={onClose} className="close-btn">
          <X size={14} />
        </button>
      </div>

      <div className="menu-divider" />

      {existingAnnotations.length > 0 && (
        <>
          <div className="menu-section">
            <div className="section-title">Current Annotations ({existingAnnotations.length})</div>
            {existingAnnotations.map(annotation => {
              const annotationType = annotationTypes.find(t => t.type === annotation.type);
              if (!annotationType) return null;
              
              return (
                <div key={annotation.type} className="current-annotation">
                  <span className="annotation-info">
                    <annotationType.icon size={14} />
                    {annotationType.label}
                  </span>
                  <button
                    onClick={() => onRemoveAnnotation(annotation.type)}
                    className="remove-btn"
                    title="Remove this annotation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="menu-divider" />
        </>
      )}

      <div className="menu-section">
        <div className="section-title">
          {existingAnnotations.length > 0 ? 'Add More Annotations' : 'Add Annotation'}
        </div>
        
        {annotationTypes.map(({ type, label, icon: Icon, color }) => {
          const hasThisAnnotation = hasAnnotation(type);
          // Allow adding multiple annotations - only disable if this specific type already exists
          const isDisabled = hasThisAnnotation;
          
          if (type === 'pause') {
            // Special handling for pause - show before/after options
            return (
              <div key={type} className="pause-options">
                <button
                  onClick={() => onAddAnnotation('pause', 'before')}
                  className="menu-item"
                  disabled={isDisabled}
                >
                  <Icon size={16} style={{ color }} />
                  <span>Add Pause Before</span>
                </button>
                <button
                  onClick={() => onAddAnnotation('pause', 'after')}
                  className="menu-item"
                  disabled={isDisabled}
                >
                  <Icon size={16} style={{ color }} />
                  <span>Add Pause After</span>
                </button>
              </div>
            );
          }
          
          return (
            <button
              key={type}
              onClick={() => {
                if (!hasThisAnnotation) {
                  // Add new annotation (supports multiple annotations per word)
                  onAddAnnotation(type);
                }
              }}
              className="menu-item"
              disabled={isDisabled}
            >
              <Icon size={16} style={{ color }} />
              <span>{label}</span>
              {hasThisAnnotation && <span className="current-badge">Current</span>}
            </button>
          );
        })}
      </div>

      {existingAnnotations.length > 0 && (
        <>
          <div className="menu-divider" />
          <div className="menu-section">
            <button
              onClick={() => existingAnnotations.forEach(a => onRemoveAnnotation(a.type))}
              className="menu-item remove-all"
            >
              <Trash2 size={16} />
              <span>Remove All Annotations</span>
            </button>
          </div>
        </>
      )}


    </div>
  );
};

export default WordContextMenu; 