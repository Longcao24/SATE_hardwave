import { supabase } from '@/lib/supabase';

export interface Patient {
  id: string;
  slp_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  diagnosis?: string;
  contact_email?: string;
  contact_phone?: string;
  guardian_name?: string;
  guardian_phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Session {
  id: string;
  patient_id: string;
  slp_id: string;
  session_date: string;
  duration_minutes?: number;
  session_type: 'initial_evaluation' | 'therapy' | 'progress_evaluation' | 'discharge';
  goals?: string;
  activities?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PatientGoal {
  id: string;
  patient_id: string;
  goal_category: 'articulation' | 'fluency' | 'language' | 'voice' | 'pragmatics' | 'other';
  goal_description: string;
  target_date?: string;
  status: 'active' | 'achieved' | 'discontinued' | 'modified';
  progress_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  patient_id: string;
  slp_id: string;
  report_type: 'progress' | 'evaluation' | 'discharge' | 'monthly' | 'quarterly';
  report_date: string;
  content: any; // JSON structure for report data
  summary?: string;
  recommendations?: string;
  created_at: string;
  updated_at: string;
}

// Patient CRUD operations
export const patientService = {
  async getPatients() {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('is_active', true)
      .order('last_name', { ascending: true });

    if (error) throw error;
    return data as Patient[];
  },

  async getInactivePatients() {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('is_active', false)
      .order('last_name', { ascending: true });

    if (error) throw error;
    return data as Patient[];
  },

  async getAllPatients() {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('last_name', { ascending: true });

    if (error) throw error;
    return data as Patient[];
  },

  async getPatient(id: string) {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Patient;
  },

  async createPatient(patient: Omit<Patient, 'id' | 'slp_id' | 'created_at' | 'updated_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Convert undefined values to null for database insertion
    const patientData = {
      ...patient,
      date_of_birth: patient.date_of_birth || null,
      gender: patient.gender || null,
      diagnosis: patient.diagnosis || null,
      contact_email: patient.contact_email || null,
      contact_phone: patient.contact_phone || null,
      guardian_name: patient.guardian_name || null,
      guardian_phone: patient.guardian_phone || null,
      notes: patient.notes || null,
      slp_id: user.id
    };

    const { data, error } = await supabase
      .from('patients')
      .insert(patientData)
      .select()
      .single();

    if (error) throw error;
    return data as Patient;
  },

  async updatePatient(id: string, updates: Partial<Patient>) {
    // Convert undefined values to null for database insertion
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [
        key,
        value === undefined ? null : value
      ])
    );

    const { data, error } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Patient;
  },

  async deactivatePatient(id: string) {
    return this.updatePatient(id, { is_active: false });
  }
};

// Session management
export const sessionService = {
  async getPatientSessions(patientId: string) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('patient_id', patientId)
      .order('session_date', { ascending: false });

    if (error) throw error;
    return data as Session[];
  },

  async createSession(session: Omit<Session, 'id' | 'slp_id' | 'created_at' | 'updated_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sessions')
      .insert({ ...session, slp_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data as Session;
  },

  async updateSession(id: string, updates: Partial<Session>) {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Session;
  }
};

// Goals management
export const goalsService = {
  async getPatientGoals(patientId: string) {
    const { data, error } = await supabase
      .from('patient_goals')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as PatientGoal[];
  },

  async createGoal(goal: Omit<PatientGoal, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('patient_goals')
      .insert(goal)
      .select()
      .single();

    if (error) throw error;
    return data as PatientGoal;
  },

  async updateGoal(id: string, updates: Partial<PatientGoal>) {
    const { data, error } = await supabase
      .from('patient_goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as PatientGoal;
  }
};

// Reports management
export const reportService = {
  async getPatientReports(patientId: string) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('patient_id', patientId)
      .order('report_date', { ascending: false });

    if (error) throw error;
    return data as Report[];
  },

  async createReport(report: Omit<Report, 'id' | 'slp_id' | 'created_at' | 'updated_at'>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reports')
      .insert({ ...report, slp_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data as Report;
  },

  async updateReport(id: string, updates: Partial<Report>) {
    const { data, error } = await supabase
      .from('reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Report;
  }
};

// Link recordings to patients
export const patientRecordingService = {
  async linkRecordingToPatient(recordingId: string, patientId: string, sessionId?: string) {
    const { data, error } = await supabase
      .from('patient_recordings')
      .insert({ recording_id: recordingId, patient_id: patientId, session_id: sessionId })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPatientRecordings(patientId: string) {
    const { data, error } = await supabase
      .from('patient_recordings')
      .select(`
        *,
        recordings (*)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}; 