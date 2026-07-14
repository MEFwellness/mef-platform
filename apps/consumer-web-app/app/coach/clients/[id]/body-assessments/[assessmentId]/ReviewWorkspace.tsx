'use client';

import { useState } from 'react';
import { Camera, ClipboardList, Sparkles } from 'lucide-react';
import type {
  AnnotationShape,
  AssessmentAiSourceFeature,
  BodyAssessment,
  BodyAssessmentComparison,
  BodyAssessmentNote,
} from '@mef/shared-types-contracts';
import type { CoachIntelligenceWorkspace } from '@/app/actions/coach-intelligence';
import { CaptureRail, type RailCapture } from './CaptureRail';
import { MediaViewer } from './MediaViewer';
import { CollapsibleSection } from './RightPanel/CollapsibleSection';
import { SummarySection } from './RightPanel/SummarySection';
import { CoachNotesSection } from './RightPanel/CoachNotesSection';
import { AIAssistantSection } from './RightPanel/AIAssistantSection';
import { ComparisonSection, type ComparisonCapture } from './RightPanel/ComparisonSection';
import { TimelineSection } from './RightPanel/TimelineSection';
import { ActionsBar } from './RightPanel/ActionsBar';

type MobileTab = 'captures' | 'viewer' | 'details';

const TABS: { key: MobileTab; label: string; icon: typeof Camera }[] = [
  { key: 'captures', label: 'Captures', icon: Camera },
  { key: 'viewer', label: 'Viewer', icon: Sparkles },
  { key: 'details', label: 'Details', icon: ClipboardList },
];

export function ReviewWorkspace({
  clientId,
  assessmentId,
  typeLabel,
  assessment,
  captures,
  annotationsByCapture,
  note,
  coachName,
  history,
  previousAssessment,
  previousCaptures,
  comparisonRows,
  aiWorkspace,
  aiSourceFeature,
}: {
  clientId: string;
  assessmentId: string;
  typeLabel: string;
  assessment: BodyAssessment;
  captures: RailCapture[];
  annotationsByCapture: Record<string, AnnotationShape[]>;
  note: BodyAssessmentNote | null;
  coachName: string | null;
  history: BodyAssessment[];
  previousAssessment: BodyAssessment | null;
  previousCaptures: ComparisonCapture[];
  comparisonRows: BodyAssessmentComparison[];
  aiWorkspace: CoachIntelligenceWorkspace | null;
  aiSourceFeature: AssessmentAiSourceFeature;
}) {
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(
    captures[0]?.capture.id ?? null
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>('viewer');

  const selected = captures.find((c) => c.capture.id === selectedCaptureId) ?? captures[0] ?? null;

  const currentComparisonCaptures: ComparisonCapture[] = captures.map(({ capture, url }) => ({
    capture,
    url,
  }));

  return (
    <div>
      {/* Below lg, the three panels become tabs — there's no room to show a capture rail,
          a large viewer, and the detail rail side by side on a phone or a portrait tablet. */}
      <div className="mb-4 flex gap-1 rounded-full bg-white p-1 shadow-[0_2px_16px_-4px_rgba(27,58,45,0.10)] lg:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition ${
              mobileTab === key ? 'bg-[#1B3A2D] text-white' : 'text-[#6B7A72]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr_380px] lg:items-start">
        <div className={`${mobileTab === 'captures' ? 'block' : 'hidden'} lg:block`}>
          <CaptureRail
            captures={captures}
            selectedCaptureId={selected?.capture.id ?? null}
            onSelect={(id) => {
              setSelectedCaptureId(id);
              setMobileTab('viewer');
            }}
          />
        </div>

        <div className={`${mobileTab === 'viewer' ? 'block' : 'hidden'} lg:block`}>
          {selected ? (
            <MediaViewer
              key={selected.capture.id}
              capture={selected.capture}
              url={selected.url}
              label={selected.label}
              assessmentId={assessmentId}
              clientId={clientId}
              initialShapes={annotationsByCapture[selected.capture.id] ?? []}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-[28px] bg-[#12241C] text-sm text-white/50">
              No captures were recorded for this assessment.
            </div>
          )}
        </div>

        <div className={`${mobileTab === 'details' ? 'flex' : 'hidden'} flex-col gap-4 lg:flex`}>
          <CollapsibleSection title="Assessment Summary">
            <SummarySection
              assessment={assessment}
              typeLabel={typeLabel}
              coachName={coachName}
              captureCount={captures.length}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Coach Notes">
            <CoachNotesSection
              assessmentId={assessmentId}
              clientId={clientId}
              initialContent={note?.content ?? ''}
            />
          </CollapsibleSection>

          <CollapsibleSection title="AI Assistant" defaultOpen={false}>
            <AIAssistantSection
              workspace={aiWorkspace}
              sourceFeature={aiSourceFeature}
              sourceRecordId={assessmentId}
              clientId={clientId}
              assessmentTypeLabel={typeLabel}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Progress Comparison" defaultOpen={false}>
            <ComparisonSection
              previousAssessment={previousAssessment}
              currentCaptures={currentComparisonCaptures}
              previousCaptures={previousCaptures}
              comparisonRows={comparisonRows}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Assessment Timeline" defaultOpen={false}>
            <TimelineSection history={history} currentAssessmentId={assessmentId} clientId={clientId} />
          </CollapsibleSection>

          <div className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
            <ActionsBar assessmentId={assessmentId} clientId={clientId} />
          </div>
        </div>
      </div>
    </div>
  );
}
