import React, { createContext, useContext, useEffect, useState } from 'react';

export type TextSize = 'small' | 'medium' | 'large' | 'extra-large';

interface AccessibilityContextValue {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  resetToDefault: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

const TEXT_SIZE_STORAGE_KEY = 'sate_text_size_preference';
const DEFAULT_TEXT_SIZE: TextSize = 'medium';

// CSS variables for each text size
const TEXT_SIZE_SCALES = {
  'small': {
    '--text-xs': '0.625rem',    // 10px
    '--text-sm': '0.75rem',      // 12px
    '--text-base': '0.875rem',   // 14px
    '--text-lg': '1rem',         // 16px
    '--text-xl': '1.125rem',     // 18px
    '--text-2xl': '1.25rem',     // 20px
    '--text-3xl': '1.5rem',      // 24px
  },
  'medium': {
    '--text-xs': '0.75rem',      // 12px
    '--text-sm': '0.875rem',     // 14px
    '--text-base': '1rem',       // 16px (default)
    '--text-lg': '1.125rem',     // 18px
    '--text-xl': '1.25rem',      // 20px
    '--text-2xl': '1.5rem',      // 24px
    '--text-3xl': '1.875rem',    // 30px
  },
  'large': {
    '--text-xs': '0.875rem',     // 14px
    '--text-sm': '1rem',         // 16px
    '--text-base': '1.125rem',   // 18px
    '--text-lg': '1.25rem',      // 20px
    '--text-xl': '1.5rem',       // 24px
    '--text-2xl': '1.875rem',    // 30px
    '--text-3xl': '2.25rem',     // 36px
  },
  'extra-large': {
    '--text-xs': '1rem',         // 16px
    '--text-sm': '1.125rem',     // 18px
    '--text-base': '1.25rem',    // 20px
    '--text-lg': '1.5rem',       // 24px
    '--text-xl': '1.875rem',     // 30px
    '--text-2xl': '2.25rem',     // 36px
    '--text-3xl': '3rem',        // 48px
  },
};

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [textSize, setTextSizeState] = useState<TextSize>(DEFAULT_TEXT_SIZE);

  // Load text size preference from localStorage on mount
  useEffect(() => {
    try {
      const savedSize = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
      if (savedSize && isValidTextSize(savedSize)) {
        setTextSizeState(savedSize as TextSize);
      }
    } catch (error) {
      console.error('Error loading text size preference:', error);
    }
  }, []);

  // Apply CSS variables whenever text size changes
  useEffect(() => {
    const root = document.documentElement;
    const scales = TEXT_SIZE_SCALES[textSize];
    
    Object.entries(scales).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    // Also add a data attribute for potential CSS targeting
    root.setAttribute('data-text-size', textSize);
  }, [textSize]);

  const setTextSize = (size: TextSize) => {
    setTextSizeState(size);
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
    } catch (error) {
      console.error('Error saving text size preference:', error);
    }
  };

  const resetToDefault = () => {
    setTextSize(DEFAULT_TEXT_SIZE);
  };

  const value: AccessibilityContextValue = {
    textSize,
    setTextSize,
    resetToDefault,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextValue => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

// Helper function to validate text size
function isValidTextSize(size: string): boolean {
  return ['small', 'medium', 'large', 'extra-large'].includes(size);
}


