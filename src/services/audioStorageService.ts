interface AudioCacheItem {
  audioData: string; // Base64 encoded audio data
  mimeType: string;
  fileName: string;
  size: number;
  cachedAt: number;
  lastAccessed: number;
}

interface AudioCacheStorage {
  [key: string]: AudioCacheItem;
}

const AUDIO_CACHE_KEY = 'sate_audio_cache';
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB limit for audio cache
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export class AudioStorageService {
  private static instance: AudioStorageService;
  
  private constructor() {}
  
  public static getInstance(): AudioStorageService {
    if (!AudioStorageService.instance) {
      AudioStorageService.instance = new AudioStorageService();
    }
    return AudioStorageService.instance;
  }

  /**
   * Generate a cache key for an audio file
   */
  private generateCacheKey(file: File): string {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }

  /**
   * Generate a cache key for a URL
   */
  private generateUrlCacheKey(url: string): string {
    return `url_${btoa(url)}`;
  }

  /**
   * Get cached audio storage from localStorage
   */
  private getCacheStorage(): AudioCacheStorage {
    try {
      const cached = localStorage.getItem(AUDIO_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn('Failed to parse audio cache from localStorage:', error);
      return {};
    }
  }

  /**
   * Save cache storage to localStorage
   */
  private setCacheStorage(cache: AudioCacheStorage): void {
    try {
      localStorage.setItem(AUDIO_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save audio cache to localStorage:', error);
      // If quota exceeded, clear old items and try again
      this.clearExpiredItems();
      try {
        localStorage.setItem(AUDIO_CACHE_KEY, JSON.stringify(cache));
      } catch (retryError) {
        console.error('Failed to save audio cache after cleanup:', retryError);
      }
    }
  }

  /**
   * Convert File to Base64 string with progress tracking
   */
  private async fileToBase64(file: File, onProgress?: (progress: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };
      
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64 data
        const base64Data = result.split(',')[1];
        if (onProgress) onProgress(100);
        resolve(base64Data);
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert Base64 string back to Blob URL
   */
  private base64ToBlob(base64Data: string, mimeType: string): Blob {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Calculate total cache size
   */
  private calculateCacheSize(cache: AudioCacheStorage): number {
    return Object.values(cache).reduce((total, item) => total + item.size, 0);
  }

  /**
   * Clear expired cache items
   */
  public clearExpiredItems(): void {
    const cache = this.getCacheStorage();
    const now = Date.now();
    const updated: AudioCacheStorage = {};

    Object.entries(cache).forEach(([key, item]) => {
      if (now - item.cachedAt < CACHE_EXPIRY) {
        updated[key] = item;
      }
    });

    this.setCacheStorage(updated);
  }

  /**
   * Clear old items to make space (LRU eviction)
   */
  private clearOldItems(cache: AudioCacheStorage, targetSize: number): AudioCacheStorage {
    // Sort by last accessed time (oldest first)
    const sortedEntries = Object.entries(cache).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed
    );

    const updated: AudioCacheStorage = {};
    let currentSize = 0;

    // Add items starting from most recently accessed until we reach target size
    for (let i = sortedEntries.length - 1; i >= 0; i--) {
      const [key, item] = sortedEntries[i];
      if (currentSize + item.size <= targetSize) {
        updated[key] = item;
        currentSize += item.size;
      }
    }

    return updated;
  }

  /**
   * Store audio file in cache with progress tracking
   */
  public async cacheAudioFile(file: File, onProgress?: (progress: number) => void): Promise<string> {
    try {
      const cacheKey = this.generateCacheKey(file);
      const cache = this.getCacheStorage();

      // Check if already cached
      if (cache[cacheKey]) {
        // Update last accessed time
        cache[cacheKey].lastAccessed = Date.now();
        this.setCacheStorage(cache);
        
        // Report instant progress if already cached
        if (onProgress) {
          onProgress(0);
          onProgress(50);
          onProgress(100);
        }
        
        // Convert back to blob URL
        const blob = this.base64ToBlob(cache[cacheKey].audioData, cache[cacheKey].mimeType);
        return URL.createObjectURL(blob);
      }

      // Convert file to base64 with progress tracking
      const base64Data = await this.fileToBase64(file, onProgress);
      const now = Date.now();

      const cacheItem: AudioCacheItem = {
        audioData: base64Data,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
        cachedAt: now,
        lastAccessed: now
      };

      // Check cache size and clean up if necessary
      let updatedCache = { ...cache, [cacheKey]: cacheItem };
      const totalSize = this.calculateCacheSize(updatedCache);

      if (totalSize > MAX_CACHE_SIZE) {
        // Remove old items to make space
        const targetSize = MAX_CACHE_SIZE - file.size;
        updatedCache = this.clearOldItems(cache, targetSize);
        updatedCache[cacheKey] = cacheItem;
      }

      this.setCacheStorage(updatedCache);

      // Convert to blob URL for playback
      const blob = this.base64ToBlob(base64Data, file.type);
      return URL.createObjectURL(blob);

    } catch (error) {
      console.error('Failed to cache audio file:', error);
      // Fallback to creating URL directly
      if (onProgress) onProgress(100);
      return URL.createObjectURL(file);
    }
  }

  /**
   * Cache audio from URL
   */
  public async cacheAudioFromUrl(url: string): Promise<string> {
    try {
      const cacheKey = this.generateUrlCacheKey(url);
      const cache = this.getCacheStorage();

      // Check if already cached
      if (cache[cacheKey]) {
        // Update last accessed time
        cache[cacheKey].lastAccessed = Date.now();
        this.setCacheStorage(cache);
        
        // Convert back to blob URL
        const blob = this.base64ToBlob(cache[cacheKey].audioData, cache[cacheKey].mimeType);
        return URL.createObjectURL(blob);
      }

      // Fetch audio from URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      const base64Data = await this.blobToBase64(audioBlob);
      const now = Date.now();

      const cacheItem: AudioCacheItem = {
        audioData: base64Data,
        mimeType: audioBlob.type,
        fileName: url.split('/').pop() || 'unknown',
        size: audioBlob.size,
        cachedAt: now,
        lastAccessed: now
      };

      // Check cache size and clean up if necessary
      let updatedCache = { ...cache, [cacheKey]: cacheItem };
      const totalSize = this.calculateCacheSize(updatedCache);

      if (totalSize > MAX_CACHE_SIZE) {
        const targetSize = MAX_CACHE_SIZE - audioBlob.size;
        updatedCache = this.clearOldItems(cache, targetSize);
        updatedCache[cacheKey] = cacheItem;
      }

      this.setCacheStorage(updatedCache);

      // Convert to blob URL for playback
      return URL.createObjectURL(audioBlob);

    } catch (error) {
      console.error('Failed to cache audio from URL:', error);
      // Fallback to original URL
      return url;
    }
  }

  /**
   * Convert Blob to Base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Check if audio is cached
   */
  public isAudioCached(file: File): boolean {
    const cacheKey = this.generateCacheKey(file);
    const cache = this.getCacheStorage();
    return !!cache[cacheKey];
  }

  /**
   * Check if URL is cached
   */
  public isUrlCached(url: string): boolean {
    const cacheKey = this.generateUrlCacheKey(url);
    const cache = this.getCacheStorage();
    return !!cache[cacheKey];
  }

  /**
   * Get cache information
   */
  public getCacheInfo(): {
    totalItems: number;
    totalSize: number;
    maxSize: number;
    items: Array<{
      fileName: string;
      size: number;
      cachedAt: Date;
      lastAccessed: Date;
    }>;
  } {
    const cache = this.getCacheStorage();
    const totalSize = this.calculateCacheSize(cache);
    const items = Object.values(cache).map(item => ({
      fileName: item.fileName,
      size: item.size,
      cachedAt: new Date(item.cachedAt),
      lastAccessed: new Date(item.lastAccessed)
    }));

    return {
      totalItems: Object.keys(cache).length,
      totalSize,
      maxSize: MAX_CACHE_SIZE,
      items
    };
  }

  /**
   * Clear all cached audio
   */
  public clearCache(): void {
    try {
      localStorage.removeItem(AUDIO_CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear audio cache:', error);
    }
  }

  /**
   * Clear specific cached audio
   */
  public clearCachedAudio(file: File): void {
    try {
      const cacheKey = this.generateCacheKey(file);
      const cache = this.getCacheStorage();
      delete cache[cacheKey];
      this.setCacheStorage(cache);
    } catch (error) {
      console.error('Failed to clear specific cached audio:', error);
    }
  }

  /**
   * Clear cached URL
   */
  public clearCachedUrl(url: string): void {
    try {
      const cacheKey = this.generateUrlCacheKey(url);
      const cache = this.getCacheStorage();
      delete cache[cacheKey];
      this.setCacheStorage(cache);
    } catch (error) {
      console.error('Failed to clear cached URL:', error);
    }
  }
}

// Export singleton instance
export const audioStorageService = AudioStorageService.getInstance(); 