/**
 * One relationship's whole version trail, newest first.
 *
 * WHAT CHANGED IS COMPUTED, NOT STORED. Each entry is compared against the
 * version below it by lib/cross-system-relationships/history.ts, so the
 * list cannot drift away from the versions it describes. Beside it sits
 * the coach's own one line reason, when she gave one, because "what moved"
 * and "why she moved it" are two different facts.
 *
 * EVERY VERSION STAYS READABLE IN FULL, which is the point of keeping
 * them: a later pattern match records the version it read, and that
 * wording has to still be there word for word when somebody asks about it
 * a year later.
 *
 * DATES ARE PINNED. formatDisplayDate is UTC, which is the right zone for
 * a staff surface reading a record's own timestamp (lib/time/displayDate.ts).
 */

import { REF_KIND_LABELS, ROLE_LABELS } from '@/lib/cross-system-relationships/constants';
import { buildVersionHistory, componentLine } from '@/lib/cross-system-relationships/history';
import type {
  RelationshipComponentRole,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import { formatDisplayDate } from '@/lib/time/displayDate';

const ROLES: RelationshipComponentRole[] = ['primary', 'related', 'support'];

function VersionBody({ version }: { version: RelationshipVersion }) {
  return (
    <div className="mt-3 space-y-3">
      {ROLES.map((role) => {
        const rows = version.components.filter((component) => component.role === role);
        if (rows.length === 0) return null;
        return (
          <div key={role}>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
              {ROLE_LABELS[role]} inputs
            </p>
            <ul className="mt-1 space-y-0.5">
              {rows.map((component) => (
                <li key={component.id} className="text-[13px] text-[#3E5C46]">
                  {componentLine(component)}
                  <span className="text-[#6B7A72]"> ({REF_KIND_LABELS[component.refKind]})</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
          Pattern composition
        </p>
        <p className="mt-1 text-[13px] text-[#3E5C46]">
          At least {version.minSupportingSignals} supporting signals before it may surface.
        </p>
        {version.strengthLevels.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {version.strengthLevels.map((level) => (
              <li key={level.levelKey} className="text-[13px] text-[#3E5C46]">
                {level.displayLabel}: {level.minSupportingSignals} supporting signals
                {level.minDistinctCategories !== null
                  ? `, across ${level.minDistinctCategories} body systems`
                  : ''}
                {level.minRelatedSignals !== null
                  ? `, with ${level.minRelatedSignals} related inputs`
                  : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {version.possibleAssociationText ? (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Possible Association text
          </p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[#3E5C46]">
            {version.possibleAssociationText}
          </p>
        </div>
      ) : null}

      {version.considerations.length > 0 ? (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Coaching considerations
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {version.considerations.map((item) => (
              <li key={item.id} className="text-[13px] text-[#3E5C46]">
                {item.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {version.evidenceNotes ? (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Evidence and methodology notes, private to you
          </p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[#3E5C46]">
            {version.evidenceNotes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function RelationshipVersionHistory({ history }: { history: RelationshipVersion[] }) {
  const entries = buildVersionHistory(history);

  if (entries.length === 0) {
    return <p className="text-sm text-[#6B7A72]">No versions to show yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {entries.map(({ version, changes }) => (
        <li key={version.id} className="rounded-2xl border border-[#1B3A2D]/10 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-[#1B3A2D]">
              Version {version.versionNumber}
            </p>
            <p className="text-[12px] text-[#6B7A72]">
              {formatDisplayDate(version.createdAt, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                // THE ZONE IS PRINTED, not just pinned. formatDisplayDate is
                // UTC, which is the right zone for a staff surface reading a
                // record's own timestamp, and a bare date hides that. A
                // version trail carries a TIME, and a time four hours off her
                // own clock with nothing naming the zone is a time she will
                // read wrong.
                timeZoneName: 'short',
              })}
            </p>
          </div>
          <p className="mt-0.5 text-[13px] text-[#4F645A]">{version.patternName}</p>

          {version.changeSummary ? (
            <p className="mt-2 text-[13px] italic text-[#3E5C46]">
              Note: {version.changeSummary}
            </p>
          ) : null}

          <div className="mt-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7A72]">
              What changed
            </p>
            {changes.length === 0 ? (
              <p className="mt-1 text-[13px] text-[#6B7A72]">
                Nothing the version trail holds moved in this edit.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {changes.map((change) => (
                  <li key={`${version.id}-${change.field}`} className="text-[13px] text-[#3E5C46]">
                    <span className="font-medium text-[#1B3A2D]">{change.field}</span>
                    {': '}
                    {change.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className="mt-3">
            <summary className="mef-focus-ring cursor-pointer list-none text-[13px] font-medium text-[#3E5C46]">
              Read this version in full
            </summary>
            <VersionBody version={version} />
          </details>
        </li>
      ))}
    </ol>
  );
}
