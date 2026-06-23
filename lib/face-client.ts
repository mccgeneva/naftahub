"use client"

// ---------------------------------------------------------------------------
// Client-side face capture helper. Lazy-loads face-api.js and its model weights
// (served from /public/models) only when the camera UI is actually used, so the
// ~7MB of models never affect normal page loads. Produces a 128-float descriptor
// from the webcam — we never upload images, only the embedding.
// ---------------------------------------------------------------------------

import type * as FaceApi from "@vladmandic/face-api"

const MODEL_URL = "/models"

let faceapi: typeof FaceApi | null = null
let modelsPromise: Promise<void> | null = null

/** Lazy-import the library and load the three required models exactly once. */
async function ensureModels(): Promise<typeof FaceApi> {
  if (!faceapi) {
    faceapi = await import("@vladmandic/face-api")
  }
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await faceapi!.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      await faceapi!.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
      await faceapi!.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    })()
  }
  await modelsPromise
  return faceapi
}

export async function preloadFaceModels(): Promise<void> {
  await ensureModels()
}

/**
 * Detect a single face in the given video element and return its 128-float
 * descriptor, or null if no (single, confident) face is found.
 */
export async function captureDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
  const api = await ensureModels()
  const detection = await api
    .detectSingleFace(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  if (!detection) return null
  return Array.from(detection.descriptor)
}
