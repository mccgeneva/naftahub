import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Icon preview",
  robots: { index: false, follow: false },
}

const ICONS = [
  { src: "/icon-512.png", label: "Browser tab & installed app", size: 160 },
  { src: "/apple-icon.png", label: "iPhone home screen", size: 120, rounded: true },
  { src: "/icon-dark-32x32.png", label: "Favicon (dark mode)", size: 32 },
  { src: "/icon-light-32x32.png", label: "Favicon (light mode)", size: 32 },
]

function IconRow({ dark }: { dark: boolean }) {
  return (
    <section
      className={`flex flex-col gap-6 rounded-xl p-6 ${dark ? "bg-foreground text-background" : "bg-card text-card-foreground border border-border"}`}
    >
      <h2 className="text-sm font-medium uppercase tracking-wide">
        {dark ? "On a dark background" : "On a light background"}
      </h2>
      <div className="flex flex-wrap items-end gap-6">
        {ICONS.map((icon) => (
          <figure key={icon.src} className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={icon.src || "/placeholder.svg"}
              alt={icon.label}
              width={icon.size}
              height={icon.size}
              className={icon.rounded ? "rounded-[22%]" : undefined}
            />
            <figcaption className="max-w-32 text-center text-xs leading-relaxed">{icon.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

export default function IconPreviewPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background p-6 text-foreground">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-balance">New MCC app icons</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Temporary preview page. These are the exact files the login page now links to.
        </p>
      </header>
      <IconRow dark={false} />
      <IconRow dark />
    </main>
  )
}
