import Link from "next/link"
import type { ReactNode } from "react"

export function AuthPageShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/login" className="mb-6 flex items-center gap-2">
            <img src="/images/mcc-logo.png" alt="MCC Capital logo" className="h-12 w-12 rounded-full object-cover" />
            <div className="flex flex-col items-start">
              <span className="text-lg font-semibold text-foreground">MCC Capital</span>
              <span className="text-[10px] text-muted-foreground">Swiss Banking</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground text-balance">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
