import React from 'react';
import { 
  Users,
  Calendar,
  Activity,
  UserCheck
} from 'lucide-react';
import type { DashboardSummary } from '../types';

interface StatsCardsProps {
  dashboardSummary: DashboardSummary | null;
}

const StatsCards: React.FC<StatsCardsProps> = ({ dashboardSummary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <span className="text-sm text-gray-500">Active</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {dashboardSummary?.activePatients || 0}
        </div>
        <p className="text-sm text-gray-600 mt-1">Patients</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <UserCheck className="w-6 h-6 text-green-600" />
          </div>
          <span className="text-sm text-gray-500">This Month</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {dashboardSummary?.newPatientsThisMonth || 0}
        </div>
        <p className="text-sm text-gray-600 mt-1">New Patients</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Calendar className="w-6 h-6 text-purple-600" />
          </div>
          <span className="text-sm text-gray-500">Completed</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {dashboardSummary?.totalSessions || 0}
        </div>
        <p className="text-sm text-gray-600 mt-1">Recording Sessions</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Activity className="w-6 h-6 text-orange-600" />
          </div>
          <span className="text-sm text-gray-500">Average</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {(dashboardSummary?.activePatients || 0) > 0 
            ? Math.round((dashboardSummary?.totalSessions || 0) / (dashboardSummary?.activePatients || 1))
            : 0}
        </div>
        <p className="text-sm text-gray-600 mt-1">Recordings per Patient</p>
      </div>
    </div>
  );
};

export default StatsCards;


