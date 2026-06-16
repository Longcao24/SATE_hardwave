// Central exports file for Dashboard module
// This file provides easy access to types and utilities for other components

// Export all types
export type {
  DashboardProps,
  PatientStats,
  DashboardSummary,
  TimeFilter
} from './types';

// Export utility functions
export {
  formatDate,
  getProgressIcon,
  filterPatientStats
} from './utils';

// Export custom hook
export { useDashboardData } from './hooks/useDashboardData';

// Export main component (default export)
export { default } from './index';


