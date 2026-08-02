import { describe, expect, it } from 'vitest';
import { getRuntimeConfig } from './runtime-config';

describe('getRuntimeConfig', () => {
  it('defaults to a local non-public runtime when deployment variables are absent', () => {
    expect(getRuntimeConfig({})).toEqual({
      dataMode: 'local',
      publicDemo: false,
      spacePath: 'public-demo',
      supabaseUrl: '',
      supabaseAnonKey: ''
    });
  });

  it('reads the explicit Supabase demo configuration', () => {
    expect(getRuntimeConfig({
      VITE_DATA_MODE: 'supabase',
      VITE_PUBLIC_DEMO: 'true',
      VITE_SPACE_PATH: 'demo-space',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key'
    })).toEqual({
      dataMode: 'supabase',
      publicDemo: true,
      spacePath: 'demo-space',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });
  });

  it('falls back to local mode for an unknown data mode', () => {
    expect(getRuntimeConfig({ VITE_DATA_MODE: 'remote' })).toMatchObject({ dataMode: 'local' });
  });
});
