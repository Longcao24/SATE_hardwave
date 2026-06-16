import { supabase } from '@/lib/supabase';

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface InviteCodeUsage {
  id: string;
  invite_code_id: string;
  used_by: string;
  used_at: string;
}

/**
 * Generate a new invite code
 */
export async function generateInviteCode(
  maxUses: number = 1,
  expiresInDays?: number
): Promise<{ data: InviteCode | null; error: any }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return { data: null, error: { message: 'User not authenticated' } };
    }

    // Generate unique code
    const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');
    
    if (codeError) {
      return { data: null, error: codeError };
    }

    const code = codeData as string;
    
    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + expiresInDays);
      expiresAt = expDate.toISOString();
    }

    // Insert the invite code
    const { data, error } = await supabase
      .from('invite_codes')
      .insert({
        code,
        created_by: user.user.id,
        max_uses: maxUses,
        expires_at: expiresAt,
      })
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error generating invite code:', error);
    return { data: null, error };
  }
}

/**
 * Get all invite codes created by the current user
 */
export async function getMyInviteCodes(): Promise<{ data: InviteCode[] | null; error: any }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return { data: null, error: { message: 'User not authenticated' } };
    }

    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('created_by', user.user.id)
      .order('created_at', { ascending: false });

    return { data, error };
  } catch (error) {
    console.error('Error fetching invite codes:', error);
    return { data: null, error };
  }
}

/**
 * Validate an invite code (check if it's valid without using it)
 */
export async function validateInviteCode(code: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Invalid invite code' };
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, error: 'Invite code has expired' };
    }

    // Check if max uses reached
    if (data.current_uses >= data.max_uses) {
      return { valid: false, error: 'Invite code has reached maximum uses' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating invite code:', error);
    return { valid: false, error: 'Error validating invite code' };
  }
}

/**
 * Use an invite code (called after user signs up)
 */
export async function useInviteCode(code: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    let uid = userId;
    
    // If userId not provided, try to get current user
    if (!uid) {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        return { success: false, error: 'User not authenticated' };
      }
      uid = user.user.id;
    }

    const { data, error } = await supabase.rpc('validate_and_use_invite_code', {
      p_code: code.toUpperCase(),
      p_user_id: uid,
    });

    if (error) {
      console.error('Error using invite code:', error);
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; message?: string };
    return result.success
      ? { success: true }
      : { success: false, error: result.error || 'Unknown error' };
  } catch (error: any) {
    console.error('Error using invite code:', error);
    return { success: false, error: error.message || 'Error using invite code' };
  }
}

/**
 * Deactivate an invite code
 */
export async function deactivateInviteCode(codeId: string): Promise<{ success: boolean; error?: any }> {
  try {
    const { error } = await supabase
      .from('invite_codes')
      .update({ is_active: false })
      .eq('id', codeId);

    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deactivating invite code:', error);
    return { success: false, error };
  }
}

/**
 * Get usage statistics for an invite code
 */
export async function getInviteCodeUsage(codeId: string): Promise<{
  data: InviteCodeUsage[] | null;
  error: any;
}> {
  try {
    const { data, error } = await supabase
      .from('invite_code_usage')
      .select('*')
      .eq('invite_code_id', codeId)
      .order('used_at', { ascending: false });

    return { data, error };
  } catch (error) {
    console.error('Error fetching invite code usage:', error);
    return { data: null, error };
  }
}

