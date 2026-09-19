'use client';

import { memo, useMemo, useState } from 'react';
import type { CoreRecord, ExtraRecord } from '../lib/payload.ts';
import { CHIPS_PER_ROW, listSpecialties, otherChips as pickOtherChips, tagIdFor } from '../lib/specialties.ts';
import { companyUrl, membersUrl } from '../lib/links.ts';
import { nearestPlacedKm, type Near } from '../lib/query.ts';
import { avatarTone, monogram } from '../lib/avatar.ts';
import { GridRef } from './GridRef.tsx';
import { Icon } from './Icon.tsx';
import { Highlight } from './Highlight.tsx';
import { hasMatch } from '../lib/highlight.ts';
import { formatDate, formatFollowers, formatMembers } from '../lib/format.ts';
import { originText, type Lookups, type SearchHit } from './types.ts';

const FIELD_NAMES: Record<string, string> = {
  specialties: 'specialties', tags: 'specialties', address: 'address', place: 'area', industry: 'industry', website: 'website',
};

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

interface Props {
  record: CoreRecord;
  extra: ExtraRecord | undefined;
  extraLoaded: boolean;
  lookups: Lookups;
  near: Near | null;
  hit: SearchHit | undefined;
  selectedTags: string[];
  onTag: (id: string) => void;
  // Active search tokens for keyword highlight matching.
  terms: string[];
  // Target hub cities for prioritizing primary office badge display.
  preferCities: string[];
}

export const CompanyRow = memo(function CompanyRow({ record: r, extra, extraLoaded, lookups, near, hit, selectedTags, onTag, terms, preferCities }: Props) {
  const [open, setOpen] = useState(false);
  const nearest = near ? nearestPlacedKm(r, near) : null;
  const primary = nearest ? r.offices[nearest.office] : (r.offices.find((o) => preferCities.includes(o.city)) ?? r.offices[0]);
  const detailId = `detail-${r.handle}`;
  const matchedOutsideName = hit ? [...new Set(hit.fields.filter((f) => f !== 'name').map((f) => FIELD_NAMES[f]).filter(Boolean))] : [];
  // Operational origin classification and corroborating evidence.
  const country = r.hqCountry && r.hqCountry !== lookups.origins.home ? (lookups.country.get(r.hqCountry) ?? null) : null;
  const origin = lookups.origins.values.find((v) => v.id === r.origin);
  const originRow = origin && origin.row ? originText(origin.row, country) : null;
  const originWhy = r.originBasis === 'owner' ? (lookups.origins.notes[r.handle] ?? lookups.origins.bases.owner) : originText(lookups.origins.bases[r.originBasis], country);
  // Displays up to 5 specialty chips, prioritizing active filter tags.
  const shownTags = useMemo(() => [...r.tags.filter((t) => selectedTags.includes(t)), ...r.tags.filter((t) => !selectedTags.includes(t))].slice(0, CHIPS_PER_ROW), [r.tags, selectedTags]);
  const otherChips = useMemo(() => (extra ? pickOtherChips(r.tags, extra.specialties, lookups.tagAliases) : []), [r.tags, extra, lookups.tagAliases]);
  // Complete specialty list for expanded drawer; shared tags render as clickable filters.
  const allSpecialties = useMemo(
    () => (open && extra ? listSpecialties(extra.specialties).map((label) => {
      const id = tagIdFor(label, lookups.tagAliases);
      return { label, tag: id && lookups.tag.has(id) ? id : null };
    }) : []),
    [open, extra, lookups.tagAliases, lookups.tag],
  );
  // Direct profile URL or fallback handle link based on companyId availability.
  const members = membersUrl(r.handle, extra?.companyId ?? null);
  const moreSpecialties = extra ? r.specialtyCount > shownTags.length + otherChips.length : r.specialtyCount > CHIPS_PER_ROW;
  const tagButton = (id: string, label: string, key = id) => (
    <button key={key} type="button" className="tag" aria-pressed={selectedTags.includes(id)} title="Show only companies with this specialty" onClick={() => onTag(id)}>
      <Highlight text={label} terms={terms} />
    </button>
  );
  // Flag matches in collapsed specialties when not visible in row header.
  const shownLabels = [...shownTags.map((t) => lookups.tag.get(t) ?? t), ...otherChips];
  const markedOnScreen = terms.length > 0 && (hasMatch(r.name, terms) || shownLabels.some((l) => hasMatch(l, terms)));
  const matchedSpecialty = !markedOnScreen && terms.length > 0 && extra ? listSpecialties(extra.specialties).find((l) => hasMatch(l, terms)) ?? null : null;

  return (
    <li className="row" data-open={open}>
      <span className="avatar" data-tone={avatarTone(r.handle)} aria-hidden="true">{monogram(r.name)}</span>
      <div className="row__body">
        <div className="row__head">
          <h2 className="row__name">
            <button type="button" className="row__toggle" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(!open)}>
              <span className="row__name-text"><Highlight text={r.name} terms={terms} /></span>
              <Icon name="chevronDown" size={16} className="row__chev" />
            </button>
          </h2>
          {primary && <GridRef office={primary} lookups={lookups} km={nearest?.km ?? null} more={r.offices.length - 1} />}
        </div>
        <p className="row__meta">
          <span>{lookups.industry.get(r.industry) ?? r.industry}</span>
          {r.founded && <span>Founded {r.founded}</span>}
          {r.followers !== null && <span>{formatFollowers(r.followers)}</span>}
          {r.members !== null && <a href={members} {...external} title="Opens the list of these members on the company's profile">{formatMembers(r.members)}</a>}
          {originRow && <span>{originRow}</span>}
          {r.multiCity && <span>Several cities</span>}
        </p>
        {(shownTags.length > 0 || otherChips.length > 0 || moreSpecialties) && (
          <div className="tags">
            {shownTags.map((t) => tagButton(t, lookups.tag.get(t) ?? t))}
            {otherChips.map((label) => <span key={label} className="tag tag--plain"><Highlight text={label} terms={terms} /></span>)}
            {moreSpecialties && (
              <button type="button" className="text-button tags__more" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(!open)}>
                {open ? 'Show less' : r.specialtyCount === 1 ? 'See 1 specialty' : `See all ${r.specialtyCount} specialties`}
              </button>
            )}
          </div>
        )}
        {matchedSpecialty ? (
          <p className="row__match"><Icon name="search" size={13} />Matched in specialties:<span className="row__match-label"><Highlight text={matchedSpecialty} terms={terms} /></span></p>
        ) : matchedOutsideName.length > 0 && !hit?.fields.includes('name') && !markedOnScreen ? (
          <p className="row__match"><Icon name="search" size={13} />Matched in {matchedOutsideName.join(' and ')}</p>
        ) : null}
        <div className="row__actions">
          {r.website && <a className="action" href={r.website} {...external}><Icon name="globe" size={15} /><span className="action__host">{host(r.website)}</span></a>}
          <a className="action" href={companyUrl(r.handle, 'profile')} {...external}><Icon name="profile" size={15} />Profile</a>
          <a className="action" href={companyUrl(r.handle, 'jobs')} {...external}><Icon name="briefcase" size={15} />Jobs</a>
          {/* With a count, the count in the line above is this link. */}
          {r.members === null && <a className="action" href={members} {...external}><Icon name="users" size={15} />Associated members</a>}
        </div>
        {open && (
          <div className="detail" id={detailId}>
            <div className="detail__grid">
              <section className="detail__section">
                <h3 className="detail__label">{r.offices.length === 1 ? 'Office' : `${r.offices.length} offices`}</h3>
                <ul className="offices">
                  {r.offices.map((o, i) => (
                    <li key={i}>
                      <GridRef office={o} lookups={lookups} />
                      <span>{extra?.addresses[i] ?? (extraLoaded ? 'Street address not listed' : 'Loading address…')}</span>
                    </li>
                  ))}
                  {r.offices.length === 0 && <li>No office location listed.</li>}
                </ul>
              </section>
              {allSpecialties.length > 0 && (
                <section className="detail__section">
                  <h3 className="detail__label">{allSpecialties.length === 1 ? 'Specialty' : `${allSpecialties.length} specialties`}</h3>
                  <div className="tags">
                    {allSpecialties.map((s) => (s.tag ? tagButton(s.tag, s.label, s.label) : <span key={s.label} className="tag tag--plain"><Highlight text={s.label} terms={terms} /></span>))}
                  </div>
                </section>
              )}
            </div>
            {origin && <p className="detail__origin"><strong>{origin.label}.</strong> {originWhy}</p>}
            <div className="detail__foot">
              <p className="detail__dates">
                {extra ? (
                  <>
                    {r.followers !== null && extra.followersAsOf && <span>{formatFollowers(r.followers)}, counted {formatDate(extra.followersAsOf)}</span>}
                    {r.members !== null && extra.membersAsOf && <span>{formatMembers(r.members)}, recorded {formatDate(extra.membersAsOf)}</span>}
                    <span>Last updated {formatDate(extra.updated)}</span>
                  </>
                ) : (
                  <span>{extraLoaded ? '' : 'Loading dates…'}</span>
                )}
              </p>
              <a className="action" href={companyUrl(r.handle, 'about')} {...external}>About page<Icon name="arrowUpRight" size={14} /></a>
            </div>
          </div>
        )}
      </div>
    </li>
  );
});
