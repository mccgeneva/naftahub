"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Loader2, ScanFace, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { captureDescriptor } from "@/lib/face-client"

type Phase = "idle" | "loading" | "ready" | "scanning" | "error"

interface FaceCaptureProps {
  /** Called with a captured 128-float descriptor. Return a promise so the
      component can show progress and surface a failure message. */
  onCapture: (descriptor: number[]) => Promise<{ ok: boolean; error?: string } | void>
  /** Number of samples to gather before completing (enrollment uses several). */
  samples?: number
  /** Button label for the scan action. */
  actionLabel?: string
  /** Auto-start the camera on mount (login uses this for a fast path). */
  autoStart?: boolean
}

/**
 * Reusable webcam capture surface. Requests the camera, lets the user scan, and
 * extracts a face descriptor locally. Used for both enrollment (multiple
 * samples) and login verification (single sample). No image ever leaves the
 * device — only the numeric descriptor is passed to `onCapture`.
 */
export function FaceCapture({
  onCapture,
  samples = 1,
  actionLabel = "Scan face",
  autoStart = false,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState<string>("")
  const [progress, setProgress] = useState(0)
  const busyRef = useRef(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    setMessage("")
    setPhase("loading")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setPhase("ready")
    } catch {
      setPhase("error")
      setMessage("Camera access was denied or is unavailable. Enable camera permissions and try again.")
    }
  }, [])

  useEffect(() => {
    if (autoStart) void startCamera()
    return () => stopCamera()
  }, [autoStart, startCamera, stopCamera])

  const handleScan = useCallback(async () => {
    if (busyRef.current || !videoRef.current) return
    busyRef.current = true
    setPhase("scanning")
    setMessage("")
    try {
      const collected: number[][] = []
      for (let i = 0; i < samples; i++) {
        // Give the user a beat between samples so we capture slight variation.
        let descriptor: number[] | null = null
        for (let attempt = 0; attempt < 12 && !descriptor; attempt++) {
          descriptor = await captureDescriptor(videoRef.current)
          if (!descriptor) await new Promise((r) => setTimeout(r, 350))
        }
        if (!descriptor) {
          setPhase("ready")
          setMessage("No face detected. Make sure your face is centered and well lit.")
          busyRef.current = false
          return
        }
        collected.push(descriptor)
        setProgress(Math.round(((i + 1) / samples) * 100))
        if (i < samples - 1) await new Promise((r) => setTimeout(r, 400))
      }

      // For multi-sample enrollment send all; for single just the one.
      let lastError: string | undefined
      for (const d of collected) {
        const res = await onCapture(d)
        if (res && res.ok === false) lastError = res.error
      }
      if (lastError) {
        setPhase("ready")
        setMessage(lastError)
      } else {
        stopCamera()
        setPhase("idle")
      }
    } catch {
      setPhase("error")
      setMessage("Something went wrong during the scan. Please try again.")
    } finally {
      busyRef.current = false
      setProgress(0)
    }
  }, [onCapture, samples, stopCamera])

  const live = phase === "ready" || phase === "scanning"

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={cn(
          "relative aspect-square w-full max-w-[260px] overflow-hidden rounded-full border-2",
          phase === "scanning" ? "border-primary" : "border-border",
        )}
      >
        {/* Video is always mounted so the ref is stable; hidden until live. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn("h-full w-full object-cover", live ? "opacity-100" : "opacity-0")}
        />
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            {phase === "loading" ? (
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : phase === "error" ? (
              <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
            ) : (
              <ScanFace className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        )}
        {phase === "scanning" && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/30">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {message && (
        <p
          className={cn(
            "text-center text-sm text-pretty",
            phase === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}

      {phase === "idle" || phase === "error" ? (
        <button
          type="button"
          onClick={startCamera}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Enable camera
        </button>
      ) : (
        <button
          type="button"
          onClick={handleScan}
          disabled={phase !== "ready"}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {phase === "scanning" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Scanning…
            </>
          ) : (
            <>
              <ScanFace className="h-4 w-4" aria-hidden="true" />
              {actionLabel}
            </>
          )}
        </button>
      )}
    </div>
  )
}
