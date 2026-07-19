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
};

export function usePoseLandmarker(
  videoRef: RefObject<HTMLVideoElement>,
  active: boolean
): PoseLandmarkerState {
  const [poses, setPoses] = useState<RawPoseLandmark[][] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const landmarkerRef = useRef<import('@mediapipe/tasks-vision').PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

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
          'Posture guidance could not load. You can still capture manually — check your position carefully.'
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
    };
  }, [active]);

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
  }, [active, isLoading, loadError, videoRef]);

  return { poses, isLoading, loadError };
}
