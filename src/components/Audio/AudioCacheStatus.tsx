import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { HardDrive, Trash2, Clock, File } from 'lucide-react';
import { audioStorageService } from '@/services/audioStorageService';

interface AudioCacheStatusProps {
  className?: string;
}

export const AudioCacheStatus: React.FC<AudioCacheStatusProps> = ({ className = '' }) => {
  const [cacheInfo, setCacheInfo] = useState({
    totalItems: 0,
    totalSize: 0,
    maxSize: 0,
    items: [] as Array<{
      fileName: string;
      size: number;
      cachedAt: Date;
      lastAccessed: Date;
    }>
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const loadCacheInfo = () => {
    const info = audioStorageService.getCacheInfo();
    setCacheInfo(info);
  };

  useEffect(() => {
    loadCacheInfo();
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleClearCache = () => {
    if (confirm('Are you sure you want to clear all cached audio files?')) {
      audioStorageService.clearCache();
      loadCacheInfo();
    }
  };

  const usagePercentage = cacheInfo.maxSize > 0 ? (cacheInfo.totalSize / cacheInfo.maxSize) * 100 : 0;

  if (cacheInfo.totalItems === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          <span>No cached audio files</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-50 rounded-lg p-3 ${className}`}>
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">
            Audio Cache ({cacheInfo.totalItems} files)
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {formatFileSize(cacheInfo.totalSize)}
        </span>
      </div>

      {/* Usage bar */}
      <div className="mt-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Usage</span>
          <span>{usagePercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              usagePercentage > 90 ? 'bg-red-500' : 
              usagePercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {/* Cache management buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadCacheInfo}
              className="flex-1 text-xs"
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              className="flex-1 text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>

          {/* Cache items list */}
          <div className="max-h-40 overflow-y-auto space-y-1">
            {cacheInfo.items.map((item, index) => (
              <div key={index} className="bg-white rounded p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <File className="h-3 w-3 text-gray-400" />
                  <span className="font-medium text-gray-700 truncate flex-1">
                    {item.fileName}
                  </span>
                  <span className="text-gray-500">
                    {formatFileSize(item.size)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>Last used: {formatDate(item.lastAccessed)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 