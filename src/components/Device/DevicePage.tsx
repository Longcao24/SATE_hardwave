import { useNavigate } from 'react-router-dom';
import { DevicePanel } from './DevicePanel';
import { FirmwareUpdateBanner } from './FirmwareUpdateBanner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mic } from 'lucide-react';

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

        {/* Device Panel */}
        <div className="max-w-2xl">
          <FirmwareUpdateBanner />
          <DevicePanel />
        </div>
      </div>
    </div>
  );
}
