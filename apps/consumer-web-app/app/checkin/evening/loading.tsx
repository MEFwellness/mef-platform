import { FlowPageSkeleton } from '@/components/PageSkeleton';

/**
 * See components/PageSkeleton.tsx. This screen draws no bottom bar, so its
 * placeholder does not reserve one.
 */
export default function Loading() {
  return <FlowPageSkeleton cards={2} />;
}
