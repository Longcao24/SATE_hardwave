export interface DashboardProps {
  onImport: (file: File, patientId?: string) => void;
  onUseSampleData: () => void;
}

export interface PatientStats {
  id: string;
  name: string;
  age?: number;
  diagnosis?: string;
  totalSessions: number;
  recentSession?: string;
  progressTrend: 'improving' | 'stable' | 'declining';
  lastActivity: string;
}

export interface DashboardSummary {
  totalPatients: number;
  activePatients: number;
  newPatientsThisMonth: number;
  totalSessions: number;
  sessionsThisWeek: number;
  upcomingEvaluations: number;
}

export type TimeFilter = 'all' | 'week' | 'month';

