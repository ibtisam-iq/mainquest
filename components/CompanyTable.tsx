import type { CompanyRecord } from '../lib/types.ts';
import { companyUrl, membersUrl } from '../lib/links.ts';
import { cityCode } from '../lib/city-codes.ts';
import { avatarTone, monogram } from '../lib/avatar.ts';
import { formatFollowers, formatMembers } from '../lib/format.ts';
import { Icon } from './Icon.tsx';

// Server-rendered semantic company list optimized for SSR and search indexing.
export function CompanyTable({ rows, industryLabel, areaLabel, preferCities = [] }: { rows: CompanyRecord[]; industryLabel: (id: string) => string; areaLabel: (id: string) => string; preferCities?: string[] }) {
  return (
    <ol className="list">
      {rows.map((r) => {
        // Prioritize office within current municipal context when multiple exist.
        const o = r.offices.find((x) => preferCities.includes(x.city)) ?? r.offices[0];
        return (
          <li className="row" key={r.handle}>
            <span className="avatar" data-tone={avatarTone(r.handle)} aria-hidden="true">{monogram(r.name)}</span>
            <div className="row__body">
              <div className="row__head">
                <h3 className="row__name">{r.name}</h3>
                {o && (
                  <span className="gridref" data-precision={o.precision}>
                    <span className="gridref__dot" aria-hidden="true" />
                    <span className="gridref__code">{cityCode(o.city)}</span>
                    {o.area && <span className="gridref__area">{areaLabel(o.area)}</span>}
                  </span>
                )}
              </div>
              <p className="row__meta">
                <span>{industryLabel(r.industry)}</span>
                {r.founded && <span>Founded {r.founded}</span>}
                {r.followers !== null && <span>{formatFollowers(r.followers)}</span>}
                {r.members !== null && <a href={membersUrl(r.handle, r.companyId)} rel="noopener noreferrer">{formatMembers(r.members)}</a>}
              </p>
              <div className="row__actions">
                {r.website && <a className="action" href={r.website} rel="noopener noreferrer"><Icon name="globe" size={15} /><span className="action__host">{new URL(r.website).hostname.replace(/^www\./, '')}</span></a>}
                <a className="action" href={companyUrl(r.handle, 'profile')} rel="noopener noreferrer"><Icon name="profile" size={15} />Profile</a>
                <a className="action" href={companyUrl(r.handle, 'jobs')} rel="noopener noreferrer"><Icon name="briefcase" size={15} />Jobs</a>
                {r.members === null && <a className="action" href={membersUrl(r.handle, r.companyId)} rel="noopener noreferrer"><Icon name="users" size={15} />Associated members</a>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
