import React from 'react';
import { type Segment } from '@/services/dataService';
import type { SpeakerChangeData } from '../types';
import { getUniqueSpeakers, isValidSpeakerName } from '../utils/speakerUtils';

interface SpeakerChangeDialogProps {
  isOpen: boolean;
  speakerChangeData: SpeakerChangeData | null;
  transcriptData: Segment[];
  selectedSegments: Set<number>;
  onApply: () => void;
  onCancel: () => void;
  onDataChange: (data: SpeakerChangeData) => void;
}

const SpeakerChangeDialog: React.FC<SpeakerChangeDialogProps> = ({
  isOpen,
  speakerChangeData,
  transcriptData,
  selectedSegments,
  onApply,
  onCancel,
  onDataChange
}) => {
  if (!isOpen || !speakerChangeData) return null;

  const uniqueSpeakers = getUniqueSpeakers(transcriptData);

  const handleNewSpeakerChange = (value: string) => {
    if (value.length <= 50) {
      onDataChange({
        ...speakerChangeData,
        newSpeaker: value
      });
    }
  };

  const handleApplyToAllChange = (checked: boolean) => {
    onDataChange({
      ...speakerChangeData,
      applyToAll: checked
    });
  };

  return (
    <div 
      className="speaker-popup-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
    >
      <div 
        className="speaker-popup"
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          width: '480px',
          maxWidth: '90vw',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          position: 'relative'
        }}
      >
        <div 
          className="speaker-popup-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px'
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '20px', 
            fontWeight: '600', 
            color: '#111827' 
          }}>
            Change Speaker
          </h3>
          <button 
            onClick={onCancel} 
            className="close-btn"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '4px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = '#f3f4f6';
              target.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = 'transparent';
              target.style.color = '#9ca3af';
            }}
          >
            ×
          </button>
        </div>
        
        <div className="speaker-popup-content" style={{ marginBottom: '24px' }}>
          <div className="current-speaker" style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px',
              marginBottom: '8px'
            }}>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '500', 
                color: '#374151',
                minWidth: '120px'
              }}>
                Current Speaker:
              </label>
              <span 
                className="speaker-name"
                style={{ 
                  display: 'inline-block',
                  padding: '8px 16px',
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #e9ecef',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#495057'
                }}
              >
                {speakerChangeData.currentSpeaker}
              </span>
            </div>
          </div>
          
          <div className="new-speaker-section" style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="new-speaker"
              style={{ 
                display: 'block', 
                fontSize: '16px', 
                fontWeight: '500', 
                color: '#374151', 
                marginBottom: '8px' 
              }}
            >
              New Speaker:
            </label>
            
            {/* Pure text input */}
            <div className="speaker-input-wrapper">
              <input
                type="text"
                id="new-speaker"
                placeholder=""
                value={speakerChangeData.newSpeaker}
                onChange={(e) => handleNewSpeakerChange(e.target.value)}
                className="speaker-input-enhanced"
                maxLength={50}
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#111827',
                  backgroundColor: 'white',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            
            {/* Quick selection buttons for existing speakers */}
            {uniqueSpeakers.length > 0 && (
              <div className="speaker-suggestions" style={{ marginTop: '12px' }}>
                <div 
                  className="suggestions-label" 
                  style={{ 
                    fontSize: '14px', 
                    color: '#6b7280', 
                    marginBottom: '8px' 
                  }}
                >
                  Quick select:
                </div>
                <div className="suggestions-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {uniqueSpeakers.map(speaker => (
                    <button
                      key={speaker}
                      type="button"
                      onClick={() => onDataChange({
                        ...speakerChangeData,
                        newSpeaker: speaker
                      })}
                      className={`suggestion-btn ${
                        speakerChangeData.newSpeaker === speaker ? 'selected' : ''
                      }`}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        backgroundColor: speakerChangeData.newSpeaker === speaker ? '#3b82f6' : '#f3f4f6',
                        color: speakerChangeData.newSpeaker === speaker ? 'white' : '#374151'
                      }}
                    >
                      {speaker}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Helpful hint */}
            <div style={{ 
              fontSize: '12px', 
              color: '#6b7280', 
              marginTop: '8px' 
            }}>
              {speakerChangeData.newSpeaker && uniqueSpeakers.includes(speakerChangeData.newSpeaker) 
                ? "Using existing speaker" 
                : speakerChangeData.newSpeaker ? "Creating new speaker" : ""}
            </div>
            
            {/* Validation feedback */}
            {speakerChangeData.newSpeaker && !isValidSpeakerName(speakerChangeData.newSpeaker) && (
              <div style={{ 
                fontSize: '12px', 
                color: '#ef4444', 
                marginTop: '4px' 
              }}>
                Speaker name must be between 1-50 characters
              </div>
            )}
          </div>
          
          {speakerChangeData.segmentIndex !== undefined && (
            <div className="apply-options" style={{ marginBottom: '20px' }}>
              <label 
                className="checkbox-label"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#374151'
                }}
              >
                <input
                  type="checkbox"
                  checked={speakerChangeData.applyToAll}
                  onChange={(e) => handleApplyToAllChange(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                Apply to all segments with speaker "{speakerChangeData.currentSpeaker}"
              </label>
            </div>
          )}
          
          <div 
            className="segment-info"
            style={{
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #e9ecef'
            }}
          >
            {speakerChangeData.segmentIndex !== undefined ? (
              <p style={{ 
                margin: 0, 
                fontSize: '14px', 
                color: '#495057',
                fontWeight: '500'
              }}>
                {speakerChangeData.applyToAll
                  ? `Will update ${transcriptData.filter(s => s.speaker === speakerChangeData.currentSpeaker).length} segments`
                  : 'Will update 1 segment'
                }
              </p>
            ) : (
              <p style={{ 
                margin: 0, 
                fontSize: '14px', 
                color: '#495057',
                fontWeight: '500'
              }}>
                Will update {selectedSegments.size} selected segments
              </p>
            )}
          </div>
        </div>
        
        <div 
          className="speaker-popup-actions"
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '32px'
          }}
        >
          <button 
            onClick={onCancel} 
            className="cancel-btn"
            style={{
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              color: '#374151',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              minWidth: '100px'
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = '#f9fafb';
              target.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLButtonElement;
              target.style.backgroundColor = 'white';
              target.style.borderColor = '#d1d5db';
            }}
          >
            Cancel
          </button>
          <button 
            onClick={onApply} 
            className="apply-btn"
            disabled={!isValidSpeakerName(speakerChangeData.newSpeaker)}
            style={{
              padding: '12px 24px',
              border: 'none',
              backgroundColor: isValidSpeakerName(speakerChangeData.newSpeaker) ? '#3b82f6' : '#d1d5db',
              color: isValidSpeakerName(speakerChangeData.newSpeaker) ? 'white' : '#9ca3af',
              borderRadius: '8px',
              cursor: isValidSpeakerName(speakerChangeData.newSpeaker) ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              minWidth: '140px'
            }}
            onMouseEnter={(e) => {
              if (isValidSpeakerName(speakerChangeData.newSpeaker)) {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (isValidSpeakerName(speakerChangeData.newSpeaker)) {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpeakerChangeDialog;
