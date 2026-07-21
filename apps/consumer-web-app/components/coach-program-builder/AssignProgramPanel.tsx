'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type {
  CoachProgramTemplate,
  ProgramScheduleConfig,
  ProgramScheduleType,
} from '@mef/shared-types-contracts';
import { assignProgramToClientAction } from '@/app/actions/coach-programs';
import { generateScheduledDates } from '@/lib/coach-program-builder/scheduling';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';
const FIELD_LABEL = 'flex flex-col gap-1 text-xs font-medium text-[#6B7A72]';

const SCHEDULE_TYPE_OPTIONS: { value: ProgramScheduleType; label: string }[] = [
  { value: 'single', label: 'Single Workout' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'multiple_weeks', label: 'Multiple Weeks' },
  { value: 'specific_dates', label: 'Specific Dates' },
  { value: 'repeating', label: 'Repeating' },
];

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssignProgramPanel({
  clientId,
  templates,
}: {
  clientId: string;
  templates: CoachProgramTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [scheduleType, setScheduleType] = useState<ProgramScheduleType>('single');
  const [singleDate, setSingleDate] = useState(todayIso());
  const [weeklyStartDate, setWeeklyStartDate] = useState(todayIso());
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1, 3, 5]);
  const [weeks, setWeeks] = useState(4);
  const [specificDatesText, setSpecificDatesText] = useState('');
  const [repeatingStart, setRepeatingStart] = useState(todayIso());
  const [repeatingEnd, setRepeatingEnd] = useState(todayIso());
  const [everyNDays, setEveryNDays] = useState(3);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildScheduleConfig(): ProgramScheduleConfig {
    switch (scheduleType) {
      case 'single':
        return { type: 'single', date: singleDate };
      case 'weekly':
        return { type: 'weekly', startDate: weeklyStartDate, daysOfWeek: weeklyDays, weeks };
      case 'multiple_weeks':
        return {
          type: 'multiple_weeks',
          startDate: weeklyStartDate,
          daysOfWeek: weeklyDays,
          weeks,
        };
      case 'specific_dates':
        return {
          type: 'specific_dates',
          dates: specificDatesText
            .split(/[,\n]/)
            .map((d) => d.trim())
            .filter(Boolean),
        };
      case 'repeating':
        return {
          type: 'repeating',
          startDate: repeatingStart,
          endDate: repeatingEnd,
          everyNDays,
        };
    }
  }

  const scheduleConfig = buildScheduleConfig();
  const previewDates = generateScheduledDates(scheduleConfig);

  function toggleWeeklyDay(day: number) {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function handleSubmit(publishImmediately: boolean) {
    if (!templateId) {
      setError('Choose a program to assign.');
      return;
    }
    if (previewDates.length === 0) {
      setError('This schedule doesn’t generate any workout dates.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignProgramToClientAction(clientId, {
        templateId,
        scheduleType,
        scheduleConfig,
        assignmentNotes,
        internalNotes,
        publishImmediately,
      });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      router.push(`/coach/clients/${clientId}/programs` as Route);
    });
  }

  if (templates.length === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">
          You don’t have any active programs yet. Build one in the Program Library first.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} space-y-4 p-6`}>
      <label className={FIELD_LABEL}>
        Program
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className={INPUT}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {SCHEDULE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setScheduleType(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              scheduleType === opt.value
                ? 'bg-[#1B3A2D] text-white'
                : 'bg-[#FAFAF8] text-[#6B7A72] hover:bg-[#1B3A2D]/5'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {scheduleType === 'single' && (
        <label className={FIELD_LABEL}>
          Date
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            className={INPUT}
          />
        </label>
      )}

      {(scheduleType === 'weekly' || scheduleType === 'multiple_weeks') && (
        <div className="grid grid-cols-2 gap-3">
          <label className={FIELD_LABEL}>
            Start Date
            <input
              type="date"
              value={weeklyStartDate}
              onChange={(e) => setWeeklyStartDate(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            Weeks
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value) || 1)}
              className={INPUT}
            />
          </label>
          <div className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-[#6B7A72]">
            Days of Week
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWeeklyDay(day.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    weeklyDays.includes(day.value)
                      ? 'bg-[#F5B700] text-[#1B3A2D]'
                      : 'bg-[#FAFAF8] text-[#6B7A72] hover:bg-[#1B3A2D]/5'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {scheduleType === 'specific_dates' && (
        <label className={FIELD_LABEL}>
          Dates (comma or newline separated, YYYY-MM-DD)
          <textarea
            value={specificDatesText}
            onChange={(e) => setSpecificDatesText(e.target.value)}
            rows={3}
            placeholder={`${todayIso()}\n...`}
            className={`${INPUT} resize-none`}
          />
        </label>
      )}

      {scheduleType === 'repeating' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={FIELD_LABEL}>
            Start Date
            <input
              type="date"
              value={repeatingStart}
              onChange={(e) => setRepeatingStart(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            End Date
            <input
              type="date"
              value={repeatingEnd}
              onChange={(e) => setRepeatingEnd(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            Every N Days
            <input
              type="number"
              min={1}
              value={everyNDays}
              onChange={(e) => setEveryNDays(Number(e.target.value) || 1)}
              className={INPUT}
            />
          </label>
        </div>
      )}

      <p className="text-xs text-[#6B7A72]">
        {previewDates.length === 0
          ? 'No workout dates yet — finish configuring the schedule above.'
          : `This will create ${previewDates.length} workout${previewDates.length === 1 ? '' : 's'}.`}
      </p>

      <label className={FIELD_LABEL}>
        Message to Client (visible to them)
        <textarea
          value={assignmentNotes}
          onChange={(e) => setAssignmentNotes(e.target.value)}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </label>
      <label className={FIELD_LABEL}>
        Internal Notes (coach-only)
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSubmit(false)}
          className="rounded-full px-4 py-2 text-sm font-medium text-[#6B7A72] hover:bg-[#1B3A2D]/5 hover:text-[#1B3A2D] disabled:opacity-40"
        >
          Save as Draft
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSubmit(true)}
          className="rounded-full bg-[#1B3A2D] px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Assigning…' : 'Assign & Publish'}
        </button>
      </div>
    </div>
  );
}
