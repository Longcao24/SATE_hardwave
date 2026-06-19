import { useNavigate } from 'react-router-dom';
import { DevicePanel } from './DevicePanel';
import { DeviceSessionStatus } from './DeviceSessionStatus';
import { FirmwareUpdateBanner } from './FirmwareUpdateBanner';
import { FirmwarePublishCard } from './FirmwarePublishCard';
import { useDeviceContext } from '@/contexts/DeviceProvider';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mic } from 'lucide-react';

// Right column: the recordings/sessions the selected device uploaded. Reads the
// same context DevicePanel does, so it stays in sync with the device selector.
function DeviceRecordingsColumn() {
  const { sessions } = useDeviceContext();
  return (
    // Sticky peer panel: stays in view next to the (taller) device column and
    // scrolls its own list rather than leaving the column short.
    <div className="lg:sticky lg:top-8 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col max-h-[calc(100vh-6rem)] min-h-[480px]">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <DeviceSessionStatus sessions={sessions} />
      </div>
    </div>
  );
}

export function DevicePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="mb-4 text-gray-600 border-gray-200 hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Mic className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">SATE Recorders</h1>
                  <p className="text-gray-600">Manage your connected hardware devices and synced sessions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Two columns: device controls (left) + uploaded recordings (right).
            Left flows naturally; right is a sticky equal-height peer. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: device */}
          <div className="space-y-4">
            <FirmwareUpdateBanner />
            <FirmwarePublishCard />
            <DevicePanel />
          </div>

          {/* Right: recordings */}
          <DeviceRecordingsColumn />
        </div>
      </div>
    </div>
  );
}
