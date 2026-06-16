import React, { useMemo, useState, useRef } from 'react';
import { X, Download, FileText, BarChart3, Clock, MessageSquare, User } from 'lucide-react';
import { type Segment } from '@/services/dataService';
import { segmentsToSalt } from '@/services/saltService';

interface SaltExportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  transcriptData: Segment[];
  selectedSpeaker?: string;
}

interface TranscriptMetrics {
  totalUtterances: number;
  totalWords: number;
  totalPauses: number;
  speakers: { name: string; utteranceCount: number; wordCount: number }[];
  avgWordsPerUtterance: number;
}

interface SaltHeader {
  speakers: string; // Comma-separated list of all speakers
  language: string;
  participantId: string;
  dob: string;
  doe: string;
  ca: string;
  context: string;
}

export const SaltExportPopup: React.FC<SaltExportPopupProps> = ({
  isOpen,
  onClose,
  transcriptData,
  selectedSpeaker,
}) => {
  // State for pause inclusion
  const [includePauses, setIncludePauses] = useState(true);
  
  // State for SALT header metadata
  const [includeHeader, setIncludeHeader] = useState(true);
  const [headerData, setHeaderData] = useState<SaltHeader>({
    speakers: '',
    language: 'English',
    participantId: '',
    dob: '',
    doe: new Date().toLocaleDateString('en-US'),
    ca: '',
    context: '',
  });

  // Helper function to determine default speaker label
  const getDefaultSpeakerLabel = (speakerName: string): string => {
    const lowerName = speakerName.toLowerCase();
    if (lowerName.startsWith('child')) {
      return 'C';
    } else if (lowerName.startsWith('adult') || lowerName.startsWith('examiner')) {
      return 'E';
    }
    // Default to first letter of speaker name
    return speakerName.charAt(0).toUpperCase();
  };

  // State for speaker label mappings
  const [speakerLabels, setSpeakerLabels] = useState<Record<string, string>>({});

  // Calculate metrics
  const metrics = useMemo((): TranscriptMetrics => {
    const filteredData = selectedSpeaker 
      ? transcriptData.filter(segment => segment.speaker === selectedSpeaker && !segment.excluded)
      : transcriptData.filter(segment => !segment.excluded);

    const totalUtterances = filteredData.length;
    let totalWords = 0;
    let totalPauses = 0;
    const speakerStats = new Map<string, { utteranceCount: number; wordCount: number }>();

    filteredData.forEach(segment => {
      const speaker = segment.speaker || 'Unknown';
      const wordCount = segment.words?.length || 0;
      const pauseCount = segment.pauses?.length || 0;

      totalWords += wordCount;
      totalPauses += pauseCount;

      const stats = speakerStats.get(speaker) || { utteranceCount: 0, wordCount: 0 };
      stats.utteranceCount++;
      stats.wordCount += wordCount;
      speakerStats.set(speaker, stats);
    });

    const speakers = Array.from(speakerStats.entries()).map(([name, stats]) => ({
      name,
      utteranceCount: stats.utteranceCount,
      wordCount: stats.wordCount,
    }));

    const avgWordsPerUtterance = totalUtterances > 0 ? totalWords / totalUtterances : 0;

    return {
      totalUtterances,
      totalWords,
      totalPauses,
      speakers,
      avgWordsPerUtterance,
    };
  }, [transcriptData, selectedSpeaker]);

  // Auto-populate speakers from transcript data
  React.useEffect(() => {
    if (metrics.speakers.length > 0 && !headerData.speakers) {
      // Join all speaker names with commas
      const speakerNames = metrics.speakers.map(s => s.name).join(', ');
      setHeaderData(prev => ({
        ...prev,
        speakers: speakerNames
      }));
    }
  }, [metrics.speakers]);

  // Initialize speaker labels when metrics change
  React.useEffect(() => {
    const newLabels: Record<string, string> = {};
    metrics.speakers.forEach(speaker => {
      // Only set if not already set
      if (!speakerLabels[speaker.name]) {
        newLabels[speaker.name] = getDefaultSpeakerLabel(speaker.name);
      }
    });
    if (Object.keys(newLabels).length > 0) {
      setSpeakerLabels(prev => ({ ...prev, ...newLabels }));
    }
  }, [metrics.speakers]);

  // Generate SALT header text
  const generateHeader = (header: SaltHeader): string => {
    const lines: string[] = [];
    if (header.speakers) {
      lines.push(`$ ${header.speakers}`);
    }
    if (header.language) lines.push(`+ Language: ${header.language}`);
    if (header.participantId) lines.push(`+ ParticipantID: ${header.participantId}`);
    if (header.dob) lines.push(`+ DOB: ${header.dob}`);
    if (header.doe) lines.push(`+ DOE: ${header.doe}`);
    if (header.ca) lines.push(`+ CA: ${header.ca}`);
    if (header.context) lines.push(`+ Context: ${header.context}`);
    return lines.join('\n') + '\n\n';
  };

  // Generate initial SALT content
  // Note: Excluded segments are included with '+' prefix (handled by segmentsToSalt)
  const initialContent = useMemo(() => {
    const filteredData = selectedSpeaker 
      ? transcriptData.filter(segment => segment.speaker === selectedSpeaker)
      : transcriptData;
    
    const transcriptContent = segmentsToSalt(filteredData, includePauses, speakerLabels);
    
    if (includeHeader) {
      return generateHeader(headerData) + transcriptContent;
    }
    
    return transcriptContent;
  }, [transcriptData, selectedSpeaker, includePauses, includeHeader, headerData, speakerLabels]);

  // State for editable content
  const [editedContent, setEditedContent] = useState(initialContent);

  // Refs for synchronized scrolling
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Update edited content when initial content changes
  React.useEffect(() => {
    setEditedContent(initialContent);
  }, [initialContent]);

  // Calculate line numbers
  const lines = editedContent.split('\n');
  const lineNumbers = lines.map((_, index) => index + 1);

  // Sync scroll between textarea and line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleExport = () => {
    const filename = `transcript_${new Date().toISOString().split('T')[0]}.slt`;
    
    // Create a blob with the edited content
    const blob = new Blob([editedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    onClose();
  };

  // Early return after all hooks have been called to avoid hook ordering issues
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Download className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Export to SALT Format</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Header Metadata Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                SALT File Header
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">Include header in export</span>
              </label>
            </div>
            
            {includeHeader && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Speakers *
                  </label>
                  <input
                    type="text"
                    value={headerData.speakers}
                    onChange={(e) => setHeaderData({ ...headerData, speakers: e.target.value })}
                    placeholder="Child, Examiner"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Available: {metrics.speakers.map(s => s.name).join(', ')}
                  </p>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <input
                    type="text"
                    value={headerData.language}
                    onChange={(e) => setHeaderData({ ...headerData, language: e.target.value })}
                    placeholder="English"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Participant ID
                  </label>
                  <input
                    type="text"
                    value={headerData.participantId}
                    onChange={(e) => setHeaderData({ ...headerData, participantId: e.target.value })}
                    placeholder="UB001"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    DOB (Date of Birth)
                  </label>
                  <input
                    type="text"
                    value={headerData.dob}
                    onChange={(e) => setHeaderData({ ...headerData, dob: e.target.value })}
                    placeholder="2/21/2020"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    DOE (Date of Evaluation)
                  </label>
                  <input
                    type="text"
                    value={headerData.doe}
                    onChange={(e) => setHeaderData({ ...headerData, doe: e.target.value })}
                    placeholder="9/21/2025"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CA (Chronological Age)
                  </label>
                  <input
                    type="text"
                    value={headerData.ca}
                    onChange={(e) => setHeaderData({ ...headerData, ca: e.target.value })}
                    placeholder="5;7"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Context
                  </label>
                  <input
                    type="text"
                    value={headerData.context}
                    onChange={(e) => setHeaderData({ ...headerData, context: e.target.value })}
                    placeholder="Nar"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            
            {/* {includeHeader && (
              <p className="text-xs text-gray-500 mt-3">
                💡 Speakers are auto-populated from the transcript. Edit as needed or add comma-separated names.
              </p>
            )} */}
            
            {!includeHeader && (
              <p className="text-xs text-gray-600 mt-2">
                Enable to add participant information and context to your SALT export
              </p>
            )}
          </div>

          {/* Metrics Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Transcript Metrics</h3>
            
            {/* Stats Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {/* Total Utterances */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.totalUtterances}</div>
                <p className="text-sm text-gray-600 mt-1">Utterances</p>
              </div>

              {/* Total Words */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.totalWords}</div>
                <p className="text-sm text-gray-600 mt-1">Total Words</p>
              </div>

              {/* Average Words per Utterance */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.avgWordsPerUtterance.toFixed(1)}</div>
                <p className="text-sm text-gray-600 mt-1">Avg. Words/Utterance</p>
              </div>

              {/* Total Pauses */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.totalPauses}</div>
                <p className="text-sm text-gray-600 mt-1">Pauses</p>
              </div>
            </div>

            {/* Speaker Breakdown */}
            {metrics.speakers.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="text-base font-semibold text-gray-900">Speaker Breakdown</h4>
                </div>
                <div className="space-y-3">
                  {metrics.speakers.map((speaker, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{speaker.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">SALT Label:</span>
                          <input
                            type="text"
                            value={speakerLabels[speaker.name] || ''}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              setSpeakerLabels(prev => ({
                                ...prev,
                                [speaker.name]: value
                              }));
                            }}
                            className="w-12 px-2 py-1 text-sm text-center font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="C"
                            maxLength={3}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {speaker.utteranceCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {speaker.wordCount}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SALT Preview */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">SALT Format Preview</h3>
              <span className="text-sm text-gray-500">({lines.length} utterances)</span>
            </div>
            
            <div className="relative flex border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* Line Numbers */}
              <div 
                ref={lineNumbersRef}
                className="flex-shrink-0 bg-gray-50 text-gray-500 text-right py-3 px-3 text-sm font-mono select-none overflow-y-hidden max-h-[600px] border-r border-gray-200"
              >
                {lineNumbers.map((num) => (
                  <div key={num} className="leading-6">
                    {num}
                  </div>
                ))}
              </div>
              
              {/* Editable Content */}
              <textarea
                ref={textareaRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                onScroll={handleScroll}
                className="flex-1 bg-white text-gray-900 py-3 px-4 text-sm font-mono max-h-[600px] overflow-y-auto resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset leading-6"
                spellCheck={false}
                style={{ 
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  tabSize: 2
                }}
              />
            </div>
            
            {/* <p className="text-xs text-gray-500 mt-2">
              Edit the preview above. Your changes will be included in the exported file.
            </p> */}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="border-t border-gray-200 bg-gray-50 flex-shrink-0">
          {/* Export Options */}
          <div className="px-6 py-4 border-b border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={includePauses}
                onChange={(e) => setIncludePauses(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                Include pause annotations in SALT transcription
              </span>
            </label>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none transition-all"
            >
              <Download className="w-4 h-4" />
              Export SALT File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

