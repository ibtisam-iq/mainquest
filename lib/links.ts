// Every outbound link to a company's public profile is generated here from its handle.
// The base URL is configuration, so no profile URL is ever stored in the dataset.

// "members" is the company's page of associated members: the people whose profiles list it.
export type LinkKind = 'profile' | 'jobs' | 'members' | 'about';

const SUFFIX: Record<LinkKind, string> = {
  profile: '',
  jobs: 'jobs/',
  members: 'people/',
  about: 'about/',
};

// Written out in full so Next.js can substitute the value at build time.
const RAW_BASE = process.env.NEXT_PUBLIC_PROFILE_BASE_URL;

function readBase(): string {
  if (!RAW_BASE) throw new Error('NEXT_PUBLIC_PROFILE_BASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  let url: URL;
  try {
    url = new URL(RAW_BASE);
  } catch {
    throw new Error('NEXT_PUBLIC_PROFILE_BASE_URL is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new Error('NEXT_PUBLIC_PROFILE_BASE_URL must use https.');
  return RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`;
}

const BASE = readBase();

export function companyUrl(handle: string, kind: LinkKind = 'profile'): string {
  // Handles are stored URL-encoded, so they are used as they are.
  return `${BASE}${handle}/${SUFFIX[kind]}`;
}

// Where a company's associated members are listed. With the numeric company id, that is the people search
// filtered to the company, the same page the profile's own member count opens. Without it, the company's
// page of associated members, which lists the same people. Decision 22.
export function membersUrl(handle: string, companyId: string | null): string {
  if (!companyId) return companyUrl(handle, 'members');
  return `${new URL(BASE).origin}/search/results/people/?currentCompany=${encodeURIComponent(JSON.stringify([companyId]))}`;
}
