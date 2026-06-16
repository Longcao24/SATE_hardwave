import React from 'react';

const DeviceRotationOverlay: React.FC = () => {
  return (
    <div className="device-rotation-overlay">
      <div className="text-center">
        <i className="material-icons text-6xl mb-4">screen_rotation</i>
        <h2 className="text-xl font-medium mb-2">Rotate Your Device</h2>
        <p className="text-sm opacity-75">Please rotate your device to portrait mode for the best experience.</p>
      </div>
    </div>
  );
};

export default DeviceRotationOverlay; 