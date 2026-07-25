import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SESSION_KEY } from './session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function signInWithSupabase(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase غير مفعّل. أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = data.user;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      name: user.user_metadata?.name ?? user.email ?? 'Supabase User',
      email: user.email,
      role: 'Supabase',
      source: 'supabase',
      at: new Date().toISOString(),
    }),
  );
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSupabaseUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
