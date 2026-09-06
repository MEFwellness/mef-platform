import { DetailPageSkeleton } from '@/components/PageSkeleton';

/**
 * See components/PageSkeleton.tsx. Without this file Next keeps the screen
 * she just left frozen on the display for the whole of this route's server
 * render, so the tap reads as though it did not register.
 */
export default function Loading() {
  return <DetailPageSkeleton cards={4} />;
}
