import { supabase } from '@/lib/supabase';
import { type Patient, type Session, type Report, patientService, sessionService, reportService, goalsService } from './patientService';
import { loadRecording, type SpeechAnalysis } from './dataService';

export interface PatientProgress {
  patientId: string;
  patient: Patient;
  totalSessions: number;
  totalRecordings: number;
  averageErrorRate: number;
  errorRateTrend: 'improving' | 'stable' | 'declining';
  speechMetrics: {
    wpm: { current: number; initial: number; change: number };
    fillerRate: { current: number; initial: number; change: number };
    pauseRate: { current: number; initial: number; change: number };
    morphologicalComplexity: { current: number; initial: number; change: number };
  };
  goalProgress: {
    total: number;
    achieved: number;
    active: number;
  };
}

export interface SessionReport {
  sessionId: string;
  session: Session;
  recordings: Array<{
    id: string;
    fileName: string;
    analysis: SpeechAnalysis;
  }>;
  summary: {
    duration: number;
    totalWords: number;
    errorRate: number;
    wpm: number;
  };
}

// Generate comprehensive patient report
export const generatePatientReport = async (
  patientId: string,
  reportType: Report['report_type'],
  dateRange?: { start: Date; end: Date }
): Promise<Report> => {
  try {
    // Get patient data
    const patient = await patientService.getPatient(patientId);
    
    // Get all sessions and recordings for the patient
    const sessions = await sessionService.getPatientSessions(patientId);
    
    // Get recordings for the patient
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    
    if (recordingsError) throw recordingsError;
    
    // Calculate progress metrics
    const progress = await calculatePatientProgress(patientId, recordings || []);
    
    // Generate report content based on type
    let content: any = {
      patient: {
        name: `${patient.first_name} ${patient.last_name}`,
        age: calculateAge(patient.date_of_birth),
        diagnosis: patient.diagnosis,
      },
      reportDate: new Date().toISOString(),
      reportType,
      sessions: sessions.length,
      recordings: recordings?.length || 0,
      progress,
    };
    
    // Add type-specific content
    switch (reportType) {
      case 'progress':
        content = {
          ...content,
          progressSummary: generateProgressSummary(progress),
          recommendations: generateRecommendations(progress),
        };
        break;
      
      case 'evaluation':
        const strengthsAndChallenges = await analyzeStrengthsAndChallenges(recordings || []);
        content = {
          ...content,
          currentStatus: generateCurrentStatus(progress),
          strengthsAndChallenges,
        };
        break;
      
      case 'monthly':
      case 'quarterly':
        const sessionReports = await generateSessionReports(sessions, recordings || []);
        const trends = await analyzeTrends(recordings || [], dateRange);
        content = {
          ...content,
          sessionReports,
          trends,
        };
        break;
    }
    
    // Create the report
    const report = await reportService.createReport({
      patient_id: patientId,
      report_type: reportType,
      report_date: new Date().toISOString().split('T')[0],
      content,
      summary: generateReportSummary(content),
      recommendations: generateRecommendations(progress),
    });
    
    return report;
  } catch (error) {
    console.error('Failed to generate patient report:', error);
    throw error;
  }
};

// Calculate patient progress over time
async function calculatePatientProgress(
  patientId: string,
  recordings: any[]
): Promise<PatientProgress> {
  const patient = await patientService.getPatient(patientId);
  const goals = await goalsService.getPatientGoals(patientId);
  const sessions = await sessionService.getPatientSessions(patientId);
  
  // Calculate speech metrics
  let speechMetrics = {
    wpm: { current: 0, initial: 0, change: 0 },
    fillerRate: { current: 0, initial: 0, change: 0 },
    pauseRate: { current: 0, initial: 0, change: 0 },
    morphologicalComplexity: { current: 0, initial: 0, change: 0 },
  };
  
  if (recordings.length > 0) {
    // Get the most recent and oldest recordings
    const recentRecordings = recordings.slice(0, 3); // Last 3 recordings
    const initialRecordings = recordings.slice(-3); // First 3 recordings
    
    // Calculate average metrics for recent and initial recordings
    const recentMetrics = await calculateAverageMetrics(recentRecordings);
    const initialMetrics = await calculateAverageMetrics(initialRecordings);
    
    const safeCalculateChange = (current: number, initial: number) => {
      if (initial === 0) return 0;
      return ((current - initial) / initial) * 100;
    };
    
    speechMetrics = {
      wpm: {
        current: recentMetrics.wpm,
        initial: initialMetrics.wpm,
        change: safeCalculateChange(recentMetrics.wpm, initialMetrics.wpm),
      },
      fillerRate: {
        current: recentMetrics.fillerRate,
        initial: initialMetrics.fillerRate,
        change: safeCalculateChange(recentMetrics.fillerRate, initialMetrics.fillerRate),
      },
      pauseRate: {
        current: recentMetrics.pauseRate,
        initial: initialMetrics.pauseRate,
        change: safeCalculateChange(recentMetrics.pauseRate, initialMetrics.pauseRate),
      },
      morphologicalComplexity: {
        current: recentMetrics.morphologicalComplexity,
        initial: initialMetrics.morphologicalComplexity,
        change: safeCalculateChange(recentMetrics.morphologicalComplexity, initialMetrics.morphologicalComplexity),
      },
    };
  }
  
  // Calculate error rate trend
  let errorRateTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recordings.length >= 2) {
    // Load first and last recording data to calculate trend
    try {
      const firstData = await loadRecording(recordings[recordings.length - 1].id);
      const lastData = await loadRecording(recordings[0].id);
      
      if (firstData && lastData) {
        const firstErrorRate = calculateErrorRate(firstData);
        const lastErrorRate = calculateErrorRate(lastData);
        
        if (lastErrorRate < firstErrorRate - 1) {
          errorRateTrend = 'improving';
        } else if (lastErrorRate > firstErrorRate + 1) {
          errorRateTrend = 'declining';
        }
      }
    } catch (error) {
      console.error('Error calculating error rate trend:', error);
    }
  }
  
  // Calculate goal progress
  const goalProgress = {
    total: goals.length,
    achieved: goals.filter((g: any) => g.status === 'achieved').length,
    active: goals.filter((g: any) => g.status === 'active').length,
  };
  
  // Calculate average error rate from recent recordings
  let averageErrorRate = 0;
  if (recordings.length > 0) {
    const recentRecordings = recordings.slice(0, 5); // Use last 5 recordings
    let totalWords = 0;
    let totalIssues = 0;
    
    for (const recording of recentRecordings) {
      try {
        const data = await loadRecording(recording.id);
        if (data) {
          const words = data.transcript.segments.reduce((sum, seg) => sum + (seg.words?.length || 0), 0);
          const issues = Object.values(data.errorCounts).reduce((sum, count) => sum + count, 0);
          totalWords += words;
          totalIssues += issues;
        }
      } catch (error) {
        console.error(`Error loading recording ${recording.id}:`, error);
      }
    }
    
    averageErrorRate = totalWords > 0 ? (totalIssues / totalWords) * 100 : 0;
  }
  
  return {
    patientId,
    patient,
    totalSessions: sessions.length,
    totalRecordings: recordings.length,
    averageErrorRate,
    errorRateTrend,
    speechMetrics,
    goalProgress,
  };
}

// Helper function to calculate error rate from recording data
function calculateErrorRate(data: any): number {
  const totalWords = data.transcript.segments.reduce((sum: number, seg: any) => sum + (seg.words?.length || 0), 0);
  const totalIssues = Object.values(data.errorCounts).reduce((sum: number, count: any) => (sum as number) + (count as number), 0);
  return totalWords > 0 ? ((totalIssues as number) / totalWords) * 100 : 0;
}

// Calculate average metrics from recordings
async function calculateAverageMetrics(recordings: any[]) {
  if (recordings.length === 0) {
    return {
      wpm: 0,
      fillerRate: 0,
      pauseRate: 0,
      morphologicalComplexity: 0,
    };
  }
  
  // Load actual analysis data for each recording
  const analysisData = [];
  for (const recording of recordings) {
    try {
      const data = await loadRecording(recording.id);
      if (data && data.analysis) {
        analysisData.push(data.analysis);
      }
    } catch (error) {
      console.error(`Failed to load recording ${recording.id}:`, error);
    }
  }
  
  if (analysisData.length === 0) {
    return {
      wpm: 0,
      fillerRate: 0,
      pauseRate: 0,
      morphologicalComplexity: 0,
    };
  }
  
  return {
    wpm: analysisData.reduce((sum, m) => sum + (m.speakingRate || 0), 0) / analysisData.length,
    fillerRate: analysisData.reduce((sum, m) => sum + (m.errorCounts?.filler || 0), 0) / analysisData.length,
    pauseRate: analysisData.reduce((sum, m) => sum + (m.numberOfPauses || 0), 0) / analysisData.length,
    morphologicalComplexity: analysisData.reduce((sum, m) => sum + (m.mlum || 0), 0) / analysisData.length,
  };
}

// Generate progress summary text
function generateProgressSummary(progress: any): string {
  const improvements = [];
  const challenges = [];
  
  // Check WPM progress
  if (progress.wpm.change > 5) {
    improvements.push(`Speech rate has improved by ${Math.round(progress.wpm.change)}%`);
  } else if (progress.wpm.change < -5) {
    challenges.push(`Speech rate has decreased by ${Math.round(Math.abs(progress.wpm.change))}%`);
  }
  
  // Check filler rate progress
  if (progress.fillerRate.change < -5) {
    improvements.push(`Filler word usage has decreased by ${Math.round(Math.abs(progress.fillerRate.change))}%`);
  } else if (progress.fillerRate.change > 5) {
    challenges.push(`Filler word usage has increased by ${Math.round(progress.fillerRate.change)}%`);
  }
  
  let summary = '';
  if (improvements.length > 0) {
    summary += `Improvements: ${improvements.join('. ')}. `;
  }
  if (challenges.length > 0) {
    summary += `Areas for focus: ${challenges.join('. ')}.`;
  }
  
  return summary || 'Patient is maintaining steady progress across all metrics.';
}

// Generate recommendations based on progress
function generateRecommendations(progress: any): string {
  const recommendations = [];
  
  if (progress.fillerRate.current > 5) {
    recommendations.push('Continue practicing pause strategies to reduce filler word usage');
  }
  
  if (progress.wpm.current < 120) {
    recommendations.push('Work on fluency exercises to increase speech rate');
  } else if (progress.wpm.current > 180) {
    recommendations.push('Practice pacing exercises to maintain optimal speech rate');
  }
  
  if (progress.morphologicalComplexity.current < 1.5) {
    recommendations.push('Introduce more complex vocabulary and sentence structures');
  }
  
  return recommendations.join('. ') + '.';
}

// Generate current status description
function generateCurrentStatus(progress: any): string {
  return `Current speech rate: ${Math.round(progress.wpm.current)} WPM. ` +
         `Filler word rate: ${progress.fillerRate.current.toFixed(1)} per minute. ` +
         `Pause rate: ${progress.pauseRate.current.toFixed(1)} per minute. ` +
         `Morphological complexity: ${progress.morphologicalComplexity.current.toFixed(2)}.`;
}

// Analyze strengths and challenges
async function analyzeStrengthsAndChallenges(recordings: any[]): Promise<{ strengths: string[]; challenges: string[] }> {
  if (recordings.length === 0) {
    return { strengths: [], challenges: [] };
  }
  
  // Get the most recent recording analysis
  let recentAnalysis = null;
  try {
    const recentRecordingData = await loadRecording(recordings[0].id);
    recentAnalysis = recentRecordingData?.analysis || {};
  } catch (error) {
    console.error('Failed to load recent recording for analysis:', error);
    return { strengths: [], challenges: [] };
  }
  
  const strengths = [];
  const challenges = [];
  
  const wpm = recentAnalysis.speakingRate || 0;
  const fillerRate = recentAnalysis.errorCounts?.filler || 0;
  const morphologicalComplexity = recentAnalysis.mlum || 0;
  const pauseRate = recentAnalysis.numberOfPauses || 0;
  
  if (wpm > 140 && wpm < 170) {
    strengths.push('Appropriate speech rate');
  }
  
  if (fillerRate < 3) {
    strengths.push('Minimal filler word usage');
  }
  
  if (morphologicalComplexity > 2) {
    strengths.push('Good vocabulary complexity');
  }
  
  if (fillerRate > 5) {
    challenges.push('Reduce filler word usage');
  }
  
  if (pauseRate > 10) {
    challenges.push('Work on fluency and reducing pauses');
  }
  
  return { strengths, challenges };
}

// Generate session reports
async function generateSessionReports(sessions: Session[], recordings: any[]): Promise<SessionReport[]> {
  const sessionReports = [];
  
  for (const session of sessions) {
    const sessionRecordings = recordings.filter(r => 
      new Date(r.created_at).toDateString() === new Date(session.session_date).toDateString()
    );
    
    // Load real analysis data for each session recording
    const recordingAnalyses = [];
    for (const recording of sessionRecordings) {
      try {
        const data = await loadRecording(recording.id);
        if (data) {
          recordingAnalyses.push({
            id: recording.id,
            fileName: recording.file_name,
            analysis: data.analysis,
            totalWords: data.transcript.segments.reduce((sum, seg) => sum + (seg.words?.length || 0), 0),
            totalIssues: Object.values(data.errorCounts).reduce((sum, count) => sum + count, 0),
          });
        }
      } catch (error) {
        console.error(`Failed to load recording ${recording.id}:`, error);
      }
    }
    
    // Calculate summary metrics
    const totalWords = recordingAnalyses.reduce((sum, r) => sum + r.totalWords, 0);
    const totalIssues = recordingAnalyses.reduce((sum, r) => sum + r.totalIssues, 0);
    const avgWpm = recordingAnalyses.reduce((sum, r) => sum + (r.analysis?.speakingRate || 0), 0) / (recordingAnalyses.length || 1);
    const avgErrorRate = totalWords > 0 ? (totalIssues / totalWords) * 100 : 0;
    
    sessionReports.push({
      sessionId: session.id,
      session,
      recordings: recordingAnalyses,
      summary: {
        duration: session.duration_minutes || 0,
        totalWords,
        errorRate: avgErrorRate,
        wpm: avgWpm,
      },
    });
  }
  
  return sessionReports;
}

// Analyze trends over time
async function analyzeTrends(recordings: any[], dateRange?: { start: Date; end: Date }): Promise<any> {
  // Filter recordings by date range if provided
  let filteredRecordings = recordings;
  if (dateRange) {
    filteredRecordings = recordings.filter(r => {
      const recordingDate = new Date(r.created_at);
      return recordingDate >= dateRange.start && recordingDate <= dateRange.end;
    });
  }
  
  if (filteredRecordings.length === 0) {
    return {
      period: dateRange ? 'custom' : 'all-time',
      recordingCount: 0,
      averageWpm: 0,
      averageErrorRate: 0,
    };
  }
  
  // Load real analysis data for trend calculation
  const analysisData = [];
  let totalWords = 0;
  let totalIssues = 0;
  
  for (const recording of filteredRecordings) {
    try {
      const data = await loadRecording(recording.id);
      if (data && data.analysis) {
        analysisData.push(data.analysis);
        totalWords += data.transcript.segments.reduce((sum, seg) => sum + (seg.words?.length || 0), 0);
        totalIssues += Object.values(data.errorCounts).reduce((sum, count) => sum + count, 0);
      }
    } catch (error) {
      console.error(`Failed to load recording ${recording.id} for trend analysis:`, error);
    }
  }
  
  return {
    period: dateRange ? 'custom' : 'all-time',
    recordingCount: filteredRecordings.length,
    averageWpm: analysisData.reduce((sum, a) => sum + (a.speakingRate || 0), 0) / (analysisData.length || 1),
    averageErrorRate: totalWords > 0 ? (totalIssues / totalWords) * 100 : 0,
  };
}

// Generate report summary
function generateReportSummary(content: any): string {
  return `${content.reportType.charAt(0).toUpperCase() + content.reportType.slice(1)} report for ${content.patient.name}. ` +
         `${content.sessions} sessions, ${content.recordings} recordings analyzed. ` +
         content.progressSummary || '';
}

// Helper function to calculate age
function calculateAge(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
} 