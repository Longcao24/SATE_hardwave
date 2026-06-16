import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { annotationColors, annotationLabels, annotationDescriptions } from '@/lib/annotationColors';
import type { Segment, Word } from '@/services/dataService';

interface AnnotationCreationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWords: Array<{ segmentIndex: number; wordIndex: number; word: Word }>;
  segments: Segment[];
  onSave: (annotations: NewAnnotation[]) => void;
  position?: { x: number; y: number };
}

interface NewAnnotation {
  type: string;
  segmentIndex: number;
  wordIndices: number[];
  data: any;
}

const AnnotationCreationPopup: React.FC<AnnotationCreationPopupProps> = ({
  isOpen,
  onClose,
  selectedWords,
  onSave,
  position = { x: 0, y: 0 }
}) => {
  const [selectedType, setSelectedType] = useState<string>('');
  const [formData, setFormData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available annotation types
  const annotationTypes = [
    'filler',
    'repetition',
    'mispronunciation',
    'pause',
    'morpheme-omission',
    'revision',
    'utterance-error'
  ] as const;

  useEffect(() => {
    if (isOpen) {
      setSelectedType('');
      setFormData({});
    }
  }, [isOpen]);

  if (!isOpen || selectedWords.length === 0) return null;

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setFormData({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const annotations: NewAnnotation[] = [];
      
      // Group selected words by segment
      const wordsBySegment = selectedWords.reduce((acc, item) => {
        if (!acc[item.segmentIndex]) {
          acc[item.segmentIndex] = [];
        }
        acc[item.segmentIndex].push(item);
        return acc;
      }, {} as Record<number, typeof selectedWords>);

      // Create annotations for each segment
      Object.entries(wordsBySegment).forEach(([segmentIndex, words]) => {
        const segmentIdx = parseInt(segmentIndex);
        const wordIndices = words.map(w => w.wordIndex);
        
        let annotationData: any = {};

        switch (selectedType) {
          case 'filler':
            // For filler words, create individual annotations for each word
            words.forEach(wordItem => {
              annotations.push({
                type: selectedType,
                segmentIndex: segmentIdx,
                wordIndices: [wordItem.wordIndex],
                data: {
                  content: wordItem.word.word,
                  start: wordItem.word.start || 0,
                  end: wordItem.word.end || 0,
                  duration: (wordItem.word.end || 0) - (wordItem.word.start || 0)
                }
              });
            });
            break;

          case 'repetition':
            annotationData = {
              content: words.map(w => w.word.word).join(' '),
              words: wordIndices,
              mark_location: formData.markLocation || wordIndices[0]
            };
            annotations.push({
              type: selectedType,
              segmentIndex: segmentIdx,
              wordIndices,
              data: annotationData
            });
            break;

          case 'mispronunciation':
            // For mispronunciation, create individual annotations for each word
            words.forEach(wordItem => {
              annotations.push({
                type: selectedType,
                segmentIndex: segmentIdx,
                wordIndices: [wordItem.wordIndex],
                data: {
                  word: wordItem.word.word,
                  start: wordItem.word.start || 0,
                  end: wordItem.word.end || 0,
                  correct_form: formData.correctForm || ''
                }
              });
            });
            break;

          case 'pause':
            // For pause, add pause annotations based on position
            const pausePosition = formData.pausePosition || 'before';
            const pauseDuration = formData.duration || 0.5;
            
            if (pausePosition === 'before') {
              // Add pause before the first selected word
              const firstWord = words[0];
              const prevWordIndex = firstWord.wordIndex - 1;
              
              let pauseStart, pauseEnd;
              if (prevWordIndex >= 0) {
                // Get the previous word from the segment
                const segment = selectedWords.find(w => w.segmentIndex === segmentIdx);
                if (segment) {
                  //const allSegmentWords = selectedWords.filter(w => w.segmentIndex === segmentIdx);
                  //const segmentData = allSegmentWords[0]; // Get segment reference
                  // Calculate pause timing between previous word and current word
                  pauseEnd = firstWord.word.start || 0;
                  pauseStart = Math.max((pauseEnd || 0) - pauseDuration, 0);
                } else {
                  pauseEnd = firstWord.word.start || 0;
                  pauseStart = Math.max((pauseEnd || 0) - pauseDuration, 0);
                }
              } else {
                // Before first word of segment
                pauseEnd = firstWord.word.start || 0;
                pauseStart = Math.max((pauseEnd || 0) - pauseDuration, 0);
              }
              
              annotations.push({
                type: 'pause',
                segmentIndex: segmentIdx,
                wordIndices: [firstWord.wordIndex],
                data: {
                  start: pauseStart,
                  end: pauseEnd,
                  duration: (pauseEnd || 0) - pauseStart,
                  position: 'before'
                }
              });
              
            } else {
              // Add pause after the last selected word
              const lastWord = words[words.length - 1];
              //const nextWordIndex = lastWord.wordIndex + 1;
              
              let pauseStart, pauseEnd;
              pauseStart = lastWord.word.end || 0;
              pauseEnd = pauseStart + pauseDuration;
              
              annotations.push({
                type: 'pause',
                segmentIndex: segmentIdx,
                wordIndices: [lastWord.wordIndex],
                data: {
                  start: pauseStart,
                  end: pauseEnd,
                  duration: pauseDuration,
                  position: 'after'
                }
              });
            }
            break;

          case 'morpheme-omission':
            words.forEach(wordItem => {
              annotations.push({
                type: selectedType,
                segmentIndex: segmentIdx,
                wordIndices: [wordItem.wordIndex],
                data: {
                  word: wordItem.word.word,
                  index: wordItem.wordIndex,
                  lemma: formData.lemma || wordItem.word.word,
                  inflectional_morpheme: formData.inflectionalMorpheme || '',
                  morpheme_form: formData.morphemeForm || ''
                }
              });
            });
            break;

          case 'revision':
            annotationData = {
              content: formData.revisionContent || words.map(w => w.word.word).join(' '),
              location: wordIndices
            };
            annotations.push({
              type: selectedType,
              segmentIndex: segmentIdx,
              wordIndices,
              data: annotationData
            });
            break;

          case 'utterance-error':
            annotationData = {
              content: words.map(w => w.word.word).join(' '),
              description: formData.description || ''
            };
            annotations.push({
              type: selectedType,
              segmentIndex: segmentIdx,
              wordIndices,
              data: annotationData
            });
            break;
        }
      });

      onSave(annotations);
      onClose();
    } catch (error) {
      console.error('Error creating annotations:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTypeSpecificForm = () => {
    switch (selectedType) {
      case 'filler':
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Filler words will be marked automatically. Selected words: {selectedWords.map(w => w.word.word).join(', ')}
            </p>
          </div>
        );

      case 'repetition':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mark Location (word index)
              </label>
              <select
                value={formData.markLocation || ''}
                onChange={(e) => setFormData({...formData, markLocation: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select word to mark</option>
                {selectedWords.map((item, idx) => (
                  <option key={idx} value={item.wordIndex}>
                    {item.word.word} (position {item.wordIndex + 1})
                  </option>
                ))}
              </select>
            </div>
          </div>
        );

      case 'mispronunciation':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correct Form
              </label>
              <input
                type="text"
                value={formData.correctForm || ''}
                onChange={(e) => setFormData({...formData, correctForm: e.target.value})}
                placeholder="Enter correct pronunciation"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'pause':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pause Position
              </label>
              <select
                value={formData.pausePosition || 'before'}
                onChange={(e) => setFormData({...formData, pausePosition: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="before">Before selected word(s)</option>
                <option value="after">After selected word(s)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={formData.duration || '0.5'}
                onChange={(e) => setFormData({...formData, duration: parseFloat(e.target.value)})}
                placeholder="0.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Default pause duration. Will be adjusted based on actual word timing.
              </p>
            </div>
            <div className="text-sm text-gray-600">
              <p>Selected words: {selectedWords.map(w => w.word.word).join(', ')}</p>
              <p className="text-xs text-gray-500 mt-1">
                Pause will be added {formData.pausePosition || 'before'} these words.
              </p>
            </div>
          </div>
        );

      case 'morpheme-omission':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lemma (root word)
              </label>
              <input
                type="text"
                value={formData.lemma || ''}
                onChange={(e) => setFormData({...formData, lemma: e.target.value})}
                placeholder="Enter root word"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Missing Morpheme
              </label>
              <input
                type="text"
                value={formData.inflectionalMorpheme || ''}
                onChange={(e) => setFormData({...formData, inflectionalMorpheme: e.target.value})}
                placeholder="e.g., -ed, -s, -ing"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Morpheme Form
              </label>
              <input
                type="text"
                value={formData.morphemeForm || ''}
                onChange={(e) => setFormData({...formData, morphemeForm: e.target.value})}
                placeholder="Morpheme form"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'revision':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Revision Content
              </label>
              <textarea
                value={formData.revisionContent || ''}
                onChange={(e) => setFormData({...formData, revisionContent: e.target.value})}
                placeholder="What was the revision/correction?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'utterance-error':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Additional notes about the error"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        style={{ 
          top: Math.min(position.y, window.innerHeight - 400),
          left: Math.min(position.x - 200, window.innerWidth - 450),
          position: 'fixed'
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Add Annotation
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Selected words: <span className="font-medium">{selectedWords.map(w => w.word.word).join(', ')}</span>
            </p>
            <p className="text-xs text-gray-500">
              {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          {!selectedType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select annotation type:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {annotationTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => handleTypeSelect(type)}
                    className="p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: annotationColors[type as keyof typeof annotationColors] }}
                      />
                      <span className="text-sm font-medium">{annotationLabels[type as keyof typeof annotationLabels]}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {annotationDescriptions[type as keyof typeof annotationDescriptions]}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedType && (
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: annotationColors[selectedType as keyof typeof annotationColors] }}
                />
                <span className="text-sm font-medium">{annotationLabels[selectedType as keyof typeof annotationLabels]}</span>
                <button
                  onClick={() => setSelectedType('')}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800"
                >
                  Change type
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {renderTypeSpecificForm()}

                <div className="flex space-x-2 mt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        <span>Add Annotation</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnotationCreationPopup; 