import { useNavigate } from 'react-router-dom';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { DeviceCard } from '@/components/Device/DeviceCard';
import type { ManagedDevice } from '@/services/device/deviceTypes';
import { Mic, ChevronRight } from 'lucide-react';

/** The Dashboard is a summary: at most this many cards, the full list lives on /devices. */
const MAX_SHOWN = 3;

// What a clinician most needs to see first: a unit busy right now, then one that is
// reachable or has takes waiting, then the most recently seen.
function rank(d: ManagedDevice): number {
  if (d.state === 'recording' || d.state === 'uploading') return 0;
  if (d.online) return 1;
  if (d.pending_sessions > 0) return 2;
  return 3;
}

function lastSeenMs(d: ManagedDevice): number {
  const t = Date.parse(d.last_seen);
  return Number.isNaN(t) ? 0 : t;
}

export default function DeviceOverview() {
  const { devices, isConnected, selectDevice } = useDeviceContext();
  const navigate = useNavigate();

  // Open the device page ON the card that was clicked. Without selecting first,
  // /devices falls back to devices[0] (the SATE recorder), so clicking a Pendant
  // or Plaud card wrongly opened the recorder's page. Selection persists because
  // DeviceProvider wraps the whole app (above the router).
  const openDevice = (id: string) => {
    selectDevice(id);
    navigate('/devices');
  };

  if (!isConnected || devices.length === 0) {
    return null; // Don't show the section if they have no devices or API is down
  }

  const shown = [...devices]
    .sort((a, b) => rank(a) - rank(b) || lastSeenMs(b) - lastSeenMs(a))
    .slice(0, MAX_SHOWN);
  const hidden = devices.length - shown.length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Connected Recorders</h2>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {devices.length}
          </span>
        </div>
        <button
          onClick={() => navigate('/devices')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
        >
          {hidden > 0 ? 'View all' : 'Manage'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            onClick={() => openDevice(device.id)}
          />
        ))}
      </div>
    </div>
  );
}
