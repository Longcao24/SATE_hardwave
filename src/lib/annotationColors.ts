// Centralized annotation color configuration
// This ensures consistent colors across transcript, controls, and analysis components

export const annotationColors = {
  // Core colors (hex values for direct use)
  pause: '#3B82F6',           // Blue
  filler: '#F59E0B',          // Amber (Orange-yellow)
  repetition: '#EF4444',      // Red
  mispronunciation: '#8B5CF6', // Purple
  'morpheme-omission': '#EC4899', // Pink (indicates morpheme omission)
  morpheme: '#10B981',        // Emerald (Green) - positive morphology
  revision: '#7C3AED',        // Violet (revision/correction)
  'utterance-error': '#F97316' // Orange (different from other errors)
};

// Tailwind classes for buttons and UI elements
export const buttonColors = {
  pause: {
    active: 'bg-blue-500 text-white',
    inactive: 'bg-blue-100 text-blue-700 hover:bg-blue-200'
  },
  filler: {
    active: 'bg-amber-500 text-white',
    inactive: 'bg-amber-100 text-amber-700 hover:bg-amber-200'
  },
  repetition: {
    active: 'bg-red-500 text-white',
    inactive: 'bg-red-100 text-red-700 hover:bg-red-200'
  },
  mispronunciation: {
    active: 'bg-purple-500 text-white',
    inactive: 'bg-purple-100 text-purple-700 hover:bg-purple-200'
  },
  'morpheme-omission': {
    active: 'bg-pink-500 text-white',
    inactive: 'bg-pink-100 text-pink-700 hover:bg-pink-200'
  },
  morpheme: {
    active: 'bg-emerald-500 text-white',
    inactive: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
  },
  revision: {
    active: 'bg-violet-600 text-white',
    inactive: 'bg-violet-100 text-violet-700 hover:bg-violet-200'
  },
  'utterance-error': {
    active: 'bg-orange-500 text-white',
    inactive: 'bg-orange-100 text-orange-700 hover:bg-orange-200'
  }
};

// Background colors for analysis/sidebar displays
export const backgroundColors = {
  pause: 'bg-blue-500',
  filler: 'bg-amber-500',
  repetition: 'bg-red-500',
  mispronunciation: 'bg-purple-500',
  'morpheme-omission': 'bg-pink-500',
  morpheme: 'bg-emerald-500',
  revision: 'bg-violet-600',
  'utterance-error': 'bg-orange-500'
};

// Light background colors for filter displays
export const lightBackgroundColors = {
  pause: 'bg-blue-100 text-blue-800',
  filler: 'bg-amber-100 text-amber-800',
  repetition: 'bg-red-100 text-red-800',
  mispronunciation: 'bg-purple-100 text-purple-800',
  'morpheme-omission': 'bg-pink-100 text-pink-800',
  morpheme: 'bg-emerald-100 text-emerald-800',
  revision: 'bg-violet-100 text-violet-800',
  'utterance-error': 'bg-orange-100 text-orange-800'
};

// Helper function to get button colors
export const getButtonColor = (type: string, isActive: boolean): string => {
  const colors = buttonColors[type as keyof typeof buttonColors];
  if (!colors) return isActive ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  return isActive ? colors.active : colors.inactive;
};

// Helper function to get background color
export const getBackgroundColor = (type: string): string => {
  return backgroundColors[type as keyof typeof backgroundColors] || 'bg-gray-500';
};

// Helper function to get light background color
export const getLightBackgroundColor = (type: string): string => {
  return lightBackgroundColors[type as keyof typeof lightBackgroundColors] || 'bg-gray-100 text-gray-800';
};

// Helper function to get hex color
export const getAnnotationColor = (type: string): string => {
  return annotationColors[type as keyof typeof annotationColors] || '#6B7280';
};

// Display labels for annotation types
export const annotationLabels = {
  pause: 'Pauses',
  filler: 'Filler words',
  repetition: 'Repetition',
  mispronunciation: 'Mispronunciation',
  'morpheme-omission': 'Morpheme Omissions',
  morpheme: 'Morphemes',
  revision: 'Revisions',
  'utterance-error': 'Utterance Error'
};

// Detailed descriptions for annotation types
export const annotationDescriptions = {
  pause: 'Unusual pauses >250ms that may indicate speech fluency issues',
  filler: 'Non-meaningful words like "um", "uh", "like" that interrupt speech flow',
  repetition: 'Repeated words or phrases that may indicate speech disfluency',
  mispronunciation: 'Words that are pronounced incorrectly or unclearly',
  'morpheme-omission': 'Missing word endings or grammatical elements (e.g., missing "-s", "-ed")',
  morpheme: 'Positive morphological features - words with grammatical inflections',
  revision: 'Self-corrections where the speaker changes what they were saying',
  'utterance-error': 'Significant speech production errors affecting intelligibility'
};

// Helper function to get display label
export const getAnnotationLabel = (type: string): string => {
  return annotationLabels[type as keyof typeof annotationLabels] || 
    type.charAt(0).toUpperCase() + type.slice(1);
};

// Helper function to get description
export const getAnnotationDescription = (type: string): string => {
  return annotationDescriptions[type as keyof typeof annotationDescriptions] || 
    'Speech pattern requiring attention';
}; 