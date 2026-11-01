import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { P3 } from './fist';

export interface TrackResult { world: P3[] | null; image: P3[] | null }

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(video: HTMLVideoElement) {
  (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

export async function createLandmarker(): Promise<HandLandmarker> {
  const base = import.meta.env.BASE_URL;
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });
}

export class Tracker {
  private lastVideoTime = -1;
  constructor(private lm: HandLandmarker, private video: HTMLVideoElement) {}

  /** Returns undefined when there is no new video frame; otherwise the detection (null = no hand). */
  step(now: number): TrackResult | undefined {
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return undefined;
    this.lastVideoTime = this.video.currentTime;
    const res = this.lm.detectForVideo(this.video, now);
    if (!res.worldLandmarks.length) return { world: null, image: null };
    return { world: res.worldLandmarks[0], image: res.landmarks[0] };
  }
}
