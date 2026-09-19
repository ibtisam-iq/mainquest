import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('../../', import.meta.url).pathname;

export function loadLocalEnv(): void {
  const file = join(ROOT, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function registrableDomain(host: string): string {
  return host.toLowerCase().split('.').filter(Boolean).slice(-2).join('.');
}

// The profile host is configuration. The platform term is derived from it so no source file spells it.
export function profileDomain(): string {
  const raw = process.env.NEXT_PUBLIC_PROFILE_BASE_URL;
  if (!raw) throw new Error('NEXT_PUBLIC_PROFILE_BASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  return registrableDomain(new URL(raw).hostname);
}

export function platformTerm(): string {
  return profileDomain().split('.')[0];
}
