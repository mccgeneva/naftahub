"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import {
  buildCertificateRequest,
  type CertificateRequest,
  type NewCertificateInput,
} from "@/lib/certificates-shared"
import { getMyCertificateRequests, syncMyCertificateRequests } from "@/app/actions/certificates"

// ---------------------------------------------------------------------------
// Official bank certificates store (client provider).
//
// Clients REQUEST one of four official certificates; an administrator
// (Compliance desk) must APPROVE a request before the certificate can be
// issued/downloaded.
//
// Persistence now mirrors the beneficiaries feature: the DURABLE source of
// truth is Neon (lib/certificates-db.ts via app/actions/certificates.ts), so an
// administrator can see and decide on a client's requests from ANY device — the
// previous localStorage-only design meant requests made on the client's browser
// were invisible to the admin panel running in a different browser/session. A
// local cache still seeds the first paint and acts as a fallback when the
// database is unavailable (e.g. local dev without DATABASE_URL).
// ---------------------------------------------------------------------------

// Re-export the pure logic so existing imports from "@/lib/certificates-store"
// keep working unchanged.
export * from "@/lib/certificates-shared"

const REQUESTS_KEY = "mcc.certificate-requests.v1"
const requestsKey = () => scopedKey(REQUESTS_KEY)

function readCache(): CertificateRequest[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(requestsKey())
    return raw ? (JSON.parse(raw) as CertificateRequest[]) : []
  } catch {
    return []
  }
}

function writeCache(requests: CertificateRequest[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(requestsKey(), JSON.stringify(requests))
  } catch {
    // ignore quota/availability errors
  }
}

interface CertificatesContextValue {
  requests: CertificateRequest[]
  hydrated: boolean
  /** Client submits a new certificate request (status pending). Returns the record. */
  addRequest: (input: NewCertificateInput) => CertificateRequest
  /** Append a "Downloaded" audit event when an approved certificate is generated. */
  recordDownload: (id: string) => void
  /** Force a re-read from the durable server copy (e.g. after returning to the tab). */
  refresh: () => void
}

const CertificatesContext = createContext<CertificatesContextValue | null>(null)

export function CertificateRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<CertificateRequest[]>([])
  const [hydrated, setHydrated] = useState(false)
  // Skip the very first mirror that the hydration setState would trigger, so we
  // never echo freshly-loaded server data straight back to the server.
  const skipNextSync = useRef(true)

  const loadFromServer = () => {
    getMyCertificateRequests()
      .then((res) => {
        if (res.ok && res.requests.length) {
          skipNextSync.current = true
          setRequests(res.requests)
        }
      })
      .catch(() => {})
  }

  // Seed instantly from the local cache, then reconcile with the server.
  useEffect(() => {
    const cached = readCache()
    if (cached.length) setRequests(cached)

    getMyCertificateRequests()
      .then((res) => {
        if (res.ok && res.requests.length) {
          skipNextSync.current = true
          setRequests(res.requests)
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist on change: write the local cache (instant) and mirror to the server
  // (durable). The server merge preserves administrator-owned lifecycle fields.
  useEffect(() => {
    if (!hydrated) return
    writeCache(requests)
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    void syncMyCertificateRequests(
      requests.map((r) => ({ id: r.id, data: r as unknown as Record<string, unknown>, status: r.status })),
    ).catch(() => {})
  }, [requests, hydrated])

  // Re-fetch from the server when the client returns to the tab, so a freshly
  // approved/declined certificate appears without a manual reload.
  useEffect(() => {
    if (!hydrated) return
    const onFocus = () => loadFromServer()
    const onVisible = () => {
      if (document.visibilityState === "visible") loadFromServer()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const addRequest: CertificatesContextValue["addRequest"] = (input) => {
    const full = buildCertificateRequest(input)
    setRequests((prev) => [full, ...prev])
    return full
  }

  const recordDownload: CertificatesContextValue["recordDownload"] = (id) => {
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, events: [{ at: now, action: "Downloaded", actor: "Client" }, ...r.events] }
          : r,
      ),
    )
  }

  return (
    <CertificatesContext.Provider
      value={{ requests, hydrated, addRequest, recordDownload, refresh: loadFromServer }}
    >
      {children}
    </CertificatesContext.Provider>
  )
}

export function useCertificateRequests() {
  const ctx = useContext(CertificatesContext)
  if (!ctx) {
    throw new Error("useCertificateRequests must be used within a CertificateRequestsProvider")
  }
  return ctx
}
