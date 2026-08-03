export type DataMode = 'local' | 'supabase';

export type RuntimeConfig = {
  dataMode: DataMode;
  publicDemo: boolean;
  spacePath: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  privateSpacePath: string;
  sharedAuthEmail: string;
};

export type RuntimeEnv = Partial<Record<
  'VITE_DATA_MODE' | 'VITE_PUBLIC_DEMO' | 'VITE_SPACE_PATH' | 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_PRIVATE_SPACE_PATH' | 'VITE_SHARED_AUTH_EMAIL',
  string | undefined
>>;

export function getRuntimeConfig(env: RuntimeEnv = import.meta.env as RuntimeEnv): RuntimeConfig {
  const requestedMode = env.VITE_DATA_MODE;
  const dataMode: DataMode = requestedMode === 'supabase' ? 'supabase' : 'local';

  return {
    dataMode,
    publicDemo: env.VITE_PUBLIC_DEMO === 'true',
    spacePath: env.VITE_SPACE_PATH?.trim() || 'public-demo',
    supabaseUrl: env.VITE_SUPABASE_URL?.trim() || '',
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || '',
    privateSpacePath: env.VITE_PRIVATE_SPACE_PATH?.trim() || 'private-space',
    sharedAuthEmail: env.VITE_SHARED_AUTH_EMAIL?.trim().toLowerCase() || ''
  };
}
