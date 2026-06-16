import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { DeviceCard } from '@/components/Device/DeviceCard';
import { Mic, ChevronRight } from 'lucide-react';

export default function DeviceOverview() {
  const { devices, isConnected } = useDeviceContext();
  const navigate = useNavigate();

  if (!isConnected || devices.length === 0) {
    return null; // Don't show the section if they have no devices or API is down
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Connected Recorders</h2>
        </div>
        <button
          onClick={() => navigate('/devices')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
        >
          Manage <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            onClick={() => navigate('/devices')}
          />
        ))}
      </div>
    </div>
  );
}
