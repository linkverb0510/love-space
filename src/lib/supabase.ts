import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RuntimeConfig } from './runtime-config';

export function createSupabaseClient(config: RuntimeConfig): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
