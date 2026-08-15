'use client';

/**
 * Runs Google's MediaPipe Pose Landmarker against a live <video> element
 * and hands back the latest per-frame landmarks. Fully on-device (WASM),
 * no server round-trip and no API key — the model asset and WASM runtime
 * are fetched once from MediaPipe's public CDN on first use (see MODEL_URL
 * below), which is the one real dependency of this feature: it needs
 * network access on first load, same as any web font or externally-hosted
 * asset. lib/body-assessment/poseValidation.ts (pure, no mediapipe import)
 * is what actually interprets the landmarks this hook returns; this file's
 * only job is "get frames in, get landmarks out, clean up after itself."
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RawPoseLandmark } from '@/lib/body-assessment/poseTypes';
import type { SegmentationMask } from '@/lib/body-assessment/spinalCurve';

const WASM_FILESET_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Recorded alongside every stored landmark set (body_landmark_sets.model_version) so a future model upgrade is a visible, filterable fact in stored data, not a silent change. */
export const POSE_MODEL_VERSION = 'mediapipe_pose_landmarker_lite_float16_v1';

export type PoseLandmarkerState = {
  /** One entry per detected person this frame; empty when no one is visible. Null until the model has loaded at least once. */
  poses: RawPoseLandmark[][] | null;
  isLoading: boolean;
  /** Set when the model itself failed to load (e.g. no network on first use) — distinct from "no person in frame," which is a normal, expected poses=[] state. */
  loadError: string | null;
  /**
   * The most recent frame's body-outline mask, or null when segmentation
   * wasn't requested (see `segmentation` below) or no frame has produced
   * one yet. Deliberately a ref rather than state: this is a
   * full-resolution pixel buffer refreshed on every animation frame, and
   * re-rendering the camera screen that often would be pointless — the one
   * consumer (CameraCapture.tsx's capturePhoto) reads it exactly once, at
   * the moment of capture, alongside the same frame's landmarks.
   */
  latestMaskRef: RefObject<SegmentationMask | null>;
};

export function usePoseLandmarker(
  videoRef: RefObject<HTMLVideoElement>,
  active: boolean,
  /**
   * Whether to also produce a per-pixel body-outline mask each frame. Off
   * by default and switched on only for the side-view standing photos that
   * lib/body-assessment/spinalCurve.ts measures, because asking the model
   * for a mask costs real per-frame work on a phone and no other capture
   * step has any use for it.
   */
  segmentation = false
): PoseLandmarkerState {
  const [poses, setPoses] = useState<RawPoseLandmark[][] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const landmarkerRef = useRef<import('@mediapipe/tasks-vision').PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const latestMaskRef = useRef<SegmentationMask | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_FILESET_URL);
        if (cancelled) return;
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 2,
          outputSegmentationMasks: segmentation,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[pose-landmarker:load]', err);
        setLoadError(
          'Posture guidance could not load. You can still capture manually, check your position carefully.'
        );
        setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      latestMaskRef.current = null;
    };
  }, [active, segmentation]);

  useEffect(() => {
    if (!active || isLoading || loadError) return;

    function tick() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          setPoses(result.landmarks as RawPoseLandmark[][]);
          if (segmentation) captureMask(result, latestMaskRef);
        } catch (err) {
          console.error('[pose-landmarker:detect]', err);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, isLoading, loadError, videoRef, segmentation]);

  return { poses, isLoading, loadError, latestMaskRef };
}

/**
 * Copies this frame's body-outline mask out of MediaPipe's own memory and
 * into a plain array the rest of the app can hold onto.
 *
 * The copy is not optional: an MPMask is only valid until the next
 * detectForVideo call, so a reference kept past this frame would read
 * whatever the model overwrote it with. The destination buffer is reused
 * across frames rather than reallocated, because at video rate a fresh
 * multi-hundred-kilobyte allocation every frame is exactly the kind of
 * garbage-collector pressure that shows up as camera-preview stutter on a
 * phone.
 */
function captureMask(
  result: import('@mediapipe/tasks-vision').PoseLandmarkerResult,
  targetRef: { current: SegmentationMask | null }
): void {
  const mask = result.segmentationMasks?.[0];
  if (!mask) return;
  try {
    const source = mask.getAsFloat32Array();
    const existing = targetRef.current;
    const buffer =
      existing &&
      existing.width === mask.width &&
      existing.height === mask.height &&
      existing.data instanceof Float32Array &&
      existing.data.length === source.length
        ? (existing.data as Float32Array)
        : new Float32Array(source.length);
    buffer.set(source);
    targetRef.current = { data: buffer, width: mask.width, height: mask.height };
  } catch (err) {
    // A mask read failing is never a reason to break the capture the
    // member is in the middle of — the silhouette measurement simply
    // doesn't happen for this frame, same as any other optional signal.
    console.error('[pose-landmarker:segmentation]', err);
  } finally {
    mask.close();
  }
}
