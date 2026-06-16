import { 
  TrendingUp, 
  Activity, 
  AlertTriangle 
} from 'lucide-react';
import React from 'react';
import type { PatientStats } from './types';

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString();
};

export const getProgressIcon = (trend: 'improving' | 'stable' | 'declining') => {
  switch (trend) {
    case 'improving':
      return React.createElement(TrendingUp, { className: "w-4 h-4 text-green-600" });
    case 'stable':
      return React.createElement(Activity, { className: "w-4 h-4 text-blue-600" });
    case 'declining':
      return React.createElement(AlertTriangle, { className: "w-4 h-4 text-red-600" });
  }
};

export const filterPatientStats = (
  patientStats: PatientStats[], 
  timeFilter: 'all' | 'week' | 'month'
): PatientStats[] => {
  return patientStats.filter(stat => {
    if (timeFilter === 'all') return true;
    
    const lastActivityDate = new Date(stat.lastActivity);
    const now = new Date();
    const daysDiff = (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (timeFilter === 'week') return daysDiff <= 7;
    if (timeFilter === 'month') return daysDiff <= 30;
    return true;
  });
};


