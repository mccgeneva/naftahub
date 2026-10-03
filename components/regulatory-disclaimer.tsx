import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export function RegulatoryDisclaimer({
  id = "regulatory-disclaimer-title",
  className,
}: {
  id?: string
  className?: string
}) {
  const paragraph = "text-justify hyphens-auto text-xs leading-relaxed text-muted-foreground"

  return (
    <section aria-labelledby={id} className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id={id} className="text-sm font-semibold text-foreground text-balance">
            Regulatory status
          </h2>
          <p className={paragraph}>
            NAFTAhub PLC (Company No. 16421621) is a public limited company registered in England and
            Wales. Its registered office is 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ.
          </p>
          <p className={paragraph}>
            NAFTAhub is a software and technology provider. It is not a bank, payment institution, e-money
            institution or investment firm, and it is not authorised or regulated by the Financial Conduct
            Authority. NAFTAhub does not hold client money or carry out regulated activities.
          </p>
          <p className={paragraph}>
            Banking and payment services are provided to clients directly by Barclays, NatWest, UBS and J.P.
            Morgan, each through the authorised and regulated group entity named in the client&apos;s own
            agreement with that institution. Availability depends on each institution&apos;s onboarding and
            eligibility requirements. NAFTAhub&apos;s role is limited to providing technology that connects
            to those services. Deposit protection, including FSCS where applicable, depends on the institution
            and account type and applies only as set out by that institution. The banks named do not endorse
            and are not responsible for NAFTAhub&apos;s platform or content.
          </p>
          <p className={paragraph}>
            NAFTAhub PLC is a separate legal entity from MCC Holding SA (Switzerland) and from any related
            companies. References to other companies do not make them parties to your agreement with a bank or
            with NAFTAhub. NAFTAhub does not give financial, investment or legal advice.
          </p>
        </div>
      </div>
    </section>
  )
}
