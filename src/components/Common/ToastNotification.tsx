
import { type Toast } from '@/hooks/useToast';

interface ToastNotificationProps {
  toast: Toast;
}

export function ToastNotification({ toast }: ToastNotificationProps) {
  if (!toast.show) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-3 ${
      toast.type === 'success'
        ? 'bg-green-50 border border-green-200 text-green-800'
        : 'bg-red-50 border border-red-200 text-red-800'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold ${
        toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`}>
        {toast.type === 'success' ? '✓' : '✕'}
      </div>
      <p className="text-sm font-medium">{toast.message}</p>
    </div>
  );
}
