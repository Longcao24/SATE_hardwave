import type { Segment } from './dataService';

interface HistoryState {
  past: Segment[][];
  present: Segment[];
  future: Segment[][];
}

const MAX_HISTORY_SIZE = 50; // Maximum number of undo states to keep
const STORAGE_KEY_PREFIX = 'transcript_history_';

/**
 * History Service - Manages undo/redo state with localStorage persistence
 */
export class HistoryService {
  private storageKey: string;

  constructor(recordingId: string) {
    this.storageKey = `${STORAGE_KEY_PREFIX}${recordingId}`;
  }

  /**
   * Load history from localStorage
   */
  loadHistory(): HistoryState | null {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      
      // Validate the structure
      if (
        parsed &&
        Array.isArray(parsed.past) &&
        Array.isArray(parsed.present) &&
        Array.isArray(parsed.future)
      ) {
        return parsed as HistoryState;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save history to localStorage
   */
  saveHistory(history: HistoryState): void {
    try {
      // Limit history size to prevent localStorage overflow
      const limitedHistory: HistoryState = {
        past: history.past.slice(-MAX_HISTORY_SIZE),
        present: history.present,
        future: history.future.slice(0, MAX_HISTORY_SIZE)
      };

      localStorage.setItem(this.storageKey, JSON.stringify(limitedHistory));
    } catch (error) {
      // If quota exceeded, try clearing old history and retry
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          this.clearHistory();
          // Save with reduced history
          const reducedHistory: HistoryState = {
            past: history.past.slice(-10), // Keep only last 10
            present: history.present,
            future: []
          };
          localStorage.setItem(this.storageKey, JSON.stringify(reducedHistory));
        } catch (retryError) {
          // Failed to save even reduced history
        }
      }
    }
  }

  /**
   * Clear history from localStorage
   */
  clearHistory(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      // Error clearing history
    }
  }

  /**
   * Initialize history with initial state
   */
  initializeHistory(initialState: Segment[]): HistoryState {
    return {
      past: [],
      present: initialState,
      future: []
    };
  }

  /**
   * Add a new state to history (for undo)
   */
  pushState(history: HistoryState, newState: Segment[]): HistoryState {
    // Don't add if state hasn't changed
    if (JSON.stringify(history.present) === JSON.stringify(newState)) {
      return history;
    }

    const newHistory: HistoryState = {
      past: [...history.past, history.present].slice(-MAX_HISTORY_SIZE),
      present: newState,
      future: [] // Clear future when new action is performed
    };

    return newHistory;
  }

  /**
   * Undo - move back in history
   */
  undo(history: HistoryState): HistoryState | null {
    if (history.past.length === 0) {
      return null; // Nothing to undo
    }

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    return {
      past: newPast,
      present: previous,
      future: [history.present, ...history.future]
    };
  }

  /**
   * Redo - move forward in history
   */
  redo(history: HistoryState): HistoryState | null {
    if (history.future.length === 0) {
      return null; // Nothing to redo
    }

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    return {
      past: [...history.past, history.present],
      present: next,
      future: newFuture
    };
  }

  /**
   * Check if undo is available
   */
  canUndo(history: HistoryState): boolean {
    return history.past.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(history: HistoryState): boolean {
    return history.future.length > 0;
  }

  /**
   * Get history statistics
   */
  getHistoryStats(history: HistoryState): {
    undoCount: number;
    redoCount: number;
    totalSize: number;
  } {
    return {
      undoCount: history.past.length,
      redoCount: history.future.length,
      totalSize: history.past.length + 1 + history.future.length
    };
  }

  /**
   * Clear all transcript histories from localStorage (utility method)
   */
  static clearAllHistories(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(STORAGE_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      // Error clearing all histories
    }
  }
}

export default HistoryService;

