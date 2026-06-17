// Single source of truth for the MCC Capital Client Handbook.
// Consumed by both the on-screen handbook page and the PDF generator so the
// downloadable document always matches what the client reads in-app.

export interface HandbookSubsection {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface HandbookSection {
  id: string
  number: string
  title: string
  intro?: string
  subsections: HandbookSubsection[]
}

export const HANDBOOK_META = {
  title: "Client Handbook",
  subtitle: "MCC Banking & Trade Platform — Complete User Guide",
  version: "Edition 2026.2",
  brand: "MCC Capital",
  legalEntity: "MCC Holding SA",
  address: "Rue du Rhône 14, 1204 Geneva, Switzerland",
  email: "support@mcc-capital.com",
}

export const HANDBOOK_SECTIONS: HandbookSection[] = [
  {
    id: "introduction",
    number: "01",
    title: "Welcome to MCC Capital",
    intro:
      "This handbook is your complete guide to the MCC Banking & Trade Platform. It explains every feature available to you, from everyday banking to advanced instrument trading, so you can operate your account with confidence.",
    subsections: [
      {
        heading: "About the Platform",
        paragraphs: [
          "The MCC Banking & Trade Platform is a private digital banking environment operated under Swiss fiduciary standards by MCC Holding SA, headquartered in Geneva. It brings together multi-currency banking, international payments, instrument trading, and fiduciary asset management in a single secure workspace.",
          "Your platform is configured specifically for your profile. Balances, transactions, and holdings always reflect your real account activity — no placeholder or demonstration figures are ever shown.",
        ],
      },
      {
        heading: "Who This Handbook Is For",
        paragraphs: [
          "This document is intended for account holders and their authorized representatives. It assumes no prior technical knowledge and walks through each area of the platform in plain language.",
        ],
      },
    ],
  },
  {
    id: "getting-started",
    number: "02",
    title: "Getting Started",
    subsections: [
      {
        heading: "Signing In",
        paragraphs: [
          "Access the platform using the email address and password issued during onboarding. For your security, always sign in directly through the official platform address and never share your credentials.",
        ],
      },
      {
        heading: "The Dashboard Overview",
        paragraphs: [
          "After signing in you arrive at the Overview page. This is your command center, summarizing your total balance, recent activity, portfolio performance, and quick actions.",
        ],
        bullets: [
          "Portfolio summary — your real aggregated balance across all accounts and currencies.",
          "Recent transactions — your latest incoming and outgoing movements.",
          "Performance chart — cumulative balance plotted from your dated ledger entries.",
          "Quick actions — shortcuts to send payments, receive funds, and more.",
        ],
      },
      {
        heading: "Navigation",
        paragraphs: [
          "The sidebar groups features into three areas: Banking, Trading & Instruments, and Platform. On mobile devices, open the menu using the button in the top bar. You can collapse the sidebar on desktop to maximize screen space.",
        ],
      },
    ],
  },
  {
    id: "banking",
    number: "03",
    title: "Everyday Banking",
    intro: "The Banking area covers the tools you use most often to move and monitor money.",
    subsections: [
      {
        heading: "Payments & Payees",
        paragraphs: [
          "Send domestic and international payments from your funded accounts. Choose a saved beneficiary or enter new details, specify the amount and currency, add a reference, and review before confirming.",
        ],
      },
      {
        heading: "Beneficiaries",
        paragraphs: [
          "Maintain a directory of trusted recipients. Each beneficiary stores the account name, bank, IBAN, and SWIFT/BIC so future payments are fast and accurate.",
        ],
      },
      {
        heading: "Transactions",
        paragraphs: [
          "Review a complete, searchable history of every movement on your account. You can filter by direction, status, and category, and download a professional PDF receipt for any individual transaction.",
        ],
      },
      {
        heading: "Live FX Rates",
        paragraphs: [
          "Monitor live foreign-exchange rates across major currency pairs and use them to inform conversions and cross-border payments.",
        ],
      },
      {
        heading: "Bank Accounts",
        paragraphs: [
          "View the accounts linked to your platform, including currency, IBAN, and SWIFT/BIC. Add new accounts with the required banking details when needed.",
        ],
      },
      {
        heading: "Cards",
        paragraphs: [
          "Manage your payment cards, review spending against your monthly limit, and access card controls. Spending figures reflect only real card activity.",
        ],
      },
    ],
  },
  {
    id: "trading",
    number: "04",
    title: "Trading & Instruments",
    intro:
      "These advanced services support institutional-grade trading, settlement, and structured returns.",
    subsections: [
      {
        heading: "NAFTAhub Trading (NQAi Engine)",
        paragraphs: [
          "NAFTAhub is the platform's automated trading section, powered by the Neural Quantum AI (NQAi) engine. It covers commodities, FX, equities, crypto, and indices with live market data and AI-generated signals.",
          "Capital shown reflects your real available balance. No funds are allocated to NQAi until you fund and deploy a position. You can also apply to the Treuhand AG Limited hedge fund directly from this section.",
        ],
        bullets: [
          "Markets — live instruments with BUY / SELL / HOLD signals.",
          "AI Signals — NQAi confidence with technical overlays.",
          "Positions — your open positions and live profit & loss.",
          "ROI Tiers — structured return tiers (PRO and Avant-Garde).",
          "Treuhand Fund — apply to the capital-guaranteed hedge fund.",
        ],
      },
      {
        heading: "Treuhand AG Limited Hedge Fund",
        paragraphs: [
          "A fully automated, capital-guaranteed investment vehicle governed under Swiss fiduciary law and powered by NQAi. The fund offers a fixed 25% monthly ROI on active trading days, with capital protected under Swiss fiduciary guarantee.",
        ],
        bullets: [
          "Token unit value: €10,000 — minimum entry of 3 tokens (€30,000).",
          "0% entry and management fees.",
          "100% capital guaranteed under Swiss fiduciary law.",
          "Onboarding requires AML / KYC due diligence prior to admission.",
        ],
      },
      {
        heading: "SWIFT Services",
        paragraphs: [
          "Initiate and track international SWIFT transfers, including MT103 and related message types, with full reference and status visibility.",
        ],
      },
      {
        heading: "Bank Instruments",
        paragraphs: [
          "Trade and manage bank instruments such as guarantees and structured notes. A dedicated Barclays Bank PLC account is designated exclusively for the receipt and processing of funds related to bank instrument trading activities; its full details are shown on the Bank Instruments page.",
        ],
      },
      {
        heading: "Institutional Desk (Download of Funds)",
        paragraphs: [
          "The Institutional Desk handles high-value Download of Funds (DOF) — the controlled receipt and crediting of large institutional funds into your MCC Capital master account. Each request is verified against its supporting SWIFT messaging and documentation, then authorized by the Administrator before the funds are credited and made available.",
          "Requests support SWIFT MT103 and MT202 messaging with full UETR tracking, and can be settled in cash (SWIFT) or coordinated through DTC or Euroclear. You can submit a new Download of Funds request and follow each one through to authorization from the same page.",
        ],
        bullets: [
          "SWIFT MT103 / MT202 messaging with end-to-end UETR tracking.",
          "Originator, originating bank, and BIC captured for every request.",
          "Settlement via SWIFT cash, DTC, or Euroclear.",
          "Funds are credited only after Administrator authorization.",
        ],
      },
      {
        heading: "Securities Settlement (DTC / Euroclear)",
        paragraphs: [
          "Settle securities through the Depository Trust Company (DTC) or Euroclear using book-entry delivery. You can deliver securities out (receiving cash) or receive securities in, on either a delivery-versus-payment (DVP) or free-of-payment (FOP) basis.",
          "Each instruction captures the security type, ISIN or CUSIP, quantity, counterparty, and cash leg, and is tracked with a UETR. Settlement is finalized only after the Administrator authorizes the instruction.",
        ],
        bullets: [
          "DTC (US, CUSIP) and Euroclear (international, ISIN) depositories.",
          "Deliver or receive securities on a DVP or FOP basis.",
          "Supports bonds, equities, MTNs, treasury and corporate notes, and fund units.",
          "Every instruction is authorized by the Administrator before settlement.",
        ],
      },
      {
        heading: "Commodity Trading Desk",
        paragraphs: [
          "Structure high-value commodity and institutional transactions with full SWIFT/BIC routing, Proof of Product (seller) and Proof of Funds (buyer) document management, and a controlled, stage-by-stage deal workflow. Every deal is reviewed and authorized by the Administrator — nothing executes automatically.",
        ],
        bullets: [
          "Proof of Product (POP) and Proof of Funds (POF) document handling with versioning.",
          "Buyer, seller, shipping route, and instrument details captured per deal.",
          "Guided deal stages from structuring through to execution.",
          "Administrator review and document verification at each step.",
        ],
      },
      {
        heading: "Leverage & Risk",
        paragraphs: [
          "Request leveraged trading lines against your account equity and monitor margin in real time. You choose a leverage ratio of 1:2, 1:5, 1:10, 1:20, or up to 1:30; the borrowed amount, total buying power, and accrued debit interest are calculated for you before you submit.",
          "Borrowed funds carry debit interest of 1.8% per year, which accrues from the moment the line is activated. When you switch a line off, the accrued interest is settled and the borrowed principal is repaid from your balance. Each line is denominated in your account's currency (EUR, USD, GBP, or CHF), and both activation and switch-off require Administrator approval.",
        ],
        bullets: [
          "Selectable leverage ratios from 1:2 up to 1:30.",
          "Live preview of borrowed funds, buying power, and interest before submitting.",
          "Debit interest of 1.8% per year on borrowed funds, settled on switch-off.",
          "Real-time margin monitoring with Administrator-approved activation and switch-off.",
        ],
      },
      {
        heading: "Yield / PPP",
        paragraphs: [
          "Explore Private Placement Programme opportunities and structured yield products. Figures reflect your real participation and are zero until you enroll.",
        ],
      },
      {
        heading: "Fiduciary & Assets",
        paragraphs: [
          "View assets held under custody through your fiduciary mandate. Total assets under custody are summed from your real holdings and remain at zero until a mandate is funded.",
        ],
      },
    ],
  },
  {
    id: "platform",
    number: "05",
    title: "Platform & Account Management",
    subsections: [
      {
        heading: "Plans & Pricing",
        paragraphs: [
          "Review the available service plans and their pricing, and understand which features are included at each level.",
        ],
      },
      {
        heading: "Services & Compliance",
        paragraphs: [
          "Access compliance documentation and the regulated services MCC provides, including AML/KYC, FATCA, and CRS standards.",
        ],
      },
      {
        heading: "Client Handbook",
        paragraphs: [
          "Read this complete guide to the platform at any time, and download it as a professionally formatted PDF for offline reference. The handbook always reflects the latest features available to you.",
        ],
      },
      {
        heading: "Administrator Authorization",
        paragraphs: [
          "High-value and institutional activities on the platform are protected by an Administrator authorization step. Outgoing payments, bank instruments, Download of Funds, DTC and Euroclear settlements, commodity deals, leverage lines, and Yield/PPP applications are submitted as requests and only take effect once the Administrator reviews and authorizes them.",
          "This control ensures that no funds move and no position is opened automatically — every sensitive action is verified against its supporting documentation first. You can follow the status of your requests on each respective page.",
        ],
      },
      {
        heading: "Settings",
        paragraphs: [
          "Manage your platform preferences, security options, and notification settings.",
        ],
      },
      {
        heading: "Profile",
        paragraphs: [
          "Review your company and KYC information. To request a change, contact support with supporting documentation.",
        ],
      },
      {
        heading: "Support",
        paragraphs: [
          "Reach the MCC team by email, phone, or in-app live chat, and browse frequently asked questions for quick answers.",
        ],
      },
    ],
  },
  {
    id: "security",
    number: "06",
    title: "Security & Compliance",
    subsections: [
      {
        heading: "Protecting Your Account",
        bullets: [
          "Never share your password or one-time codes with anyone, including staff.",
          "Always verify beneficiary details before confirming a payment.",
          "Sign out when using shared or public devices.",
          "Contact support immediately if you notice unfamiliar activity.",
        ],
      },
      {
        heading: "Regulatory Standards",
        paragraphs: [
          "MCC operates under Swiss fiduciary law and applies full AML, KYC, FATCA, and CRS due diligence. Compliance is monitored on an ongoing basis to protect clients and the integrity of the platform.",
        ],
      },
    ],
  },
  {
    id: "support",
    number: "07",
    title: "Help & Contact",
    intro: "If you need assistance at any point, the MCC team is available through the following channels.",
    subsections: [
      {
        heading: "Contact Channels",
        bullets: [
          "Email: support@mcc-capital.com — replies within 24 hours.",
          "Phone: +41 22 000 0000 — Monday to Friday, 09:00–18:00 CET.",
          "Live Chat: available in-app during business hours.",
        ],
      },
      {
        heading: "Office",
        paragraphs: [
          "MCC Holding SA, Rue du Rhône 14, 1204 Geneva, Switzerland.",
        ],
      },
    ],
  },
]
