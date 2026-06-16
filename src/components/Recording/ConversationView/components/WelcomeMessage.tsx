import React from 'react';

const WelcomeMessage: React.FC = () => {
  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <div className="welcome-icon">
          📝
        </div>
        <h1 className="welcome-title">Speech Analysis Tool</h1>
        <h2 className="welcome-subtitle">Load audio to begin analysis</h2>
        <div className="welcome-description">
          <p>Upload an audio file or load a saved recording to start analyzing speech patterns, linguistic features, and communication quality.</p>
          <ul className="welcome-features">
            <li>• Real-time speech analysis and transcription</li>
            <li>• Morphological complexity assessment</li>
            <li>• Pause and filler word detection</li>
            <li>• Interactive annotation and editing</li>
            <li>• Comprehensive speech quality metrics</li>
          </ul>
        </div>
        <div className="welcome-actions">
          <div className="action-hint">
            <span className="action-icon">📁</span>
            <span><strong>Import Audio:</strong> Use the left sidebar to upload files</span>
          </div>
          <div className="action-hint">
            <span className="action-icon">🎙️</span>
            <span><strong>Record Live:</strong> Start recording for real-time analysis</span>
          </div>
          <div className="action-hint">
            <span className="action-icon">💾</span>
            <span><strong>Load Saved:</strong> Access your previous recordings</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeMessage;
