# NAFTAhub

### Network Aimed Fuels Trade Automation

> Institutional-grade commodity trade infrastructure for automated fuels trading, settlement, and counterparty management  operating under **MCC Capital / MCC Petroli / MCC Oil & Gas**.

-----

## Overview

NAFTAhub is a purpose-built platform for automating the full lifecycle of fuels and commodity trade operations: from price discovery and order routing through to settlement, compliance reporting, and risk management.

It forms the **trade infrastructure layer** of the ATOS (Autonomous Trading Operating System), sitting between market data feeds and the NQAi AI intelligence pipeline.

-----

## Core Capabilities

|Module               |Function                                                      |
|---------------------|--------------------------------------------------------------|
|**Order Execution**  |Multi-asset routing across BRENT, WTI, and structured FX pairs|
|**Watchlist Engine** |Real-time monitoring of equities, commodities, and FX         |
|**Portfolio Manager**|Live position tracking with risk-weighted allocation          |
|**NQAi Integration** |AI insight strip powered by the Neural Quantum AI pipeline    |
|**Compliance Layer** |Trade reporting and counterparty governance                   |

-----

## Platform Architecture

```
                    ┌─────────────────────┐
    Market Data ──▶ │     NAFTAhub Core   │ ◀── NQAi Intelligence
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ Order Engine  │  │
                    │  ├───────────────┤  │
                    │  │  Risk Manager │  │
                    │  ├───────────────┤  │
                    │  │   Watchlist   │  │
                    │  ├───────────────┤  │
                    │  │  Compliance   │  │
                    │  └───────────────┘  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  cTrader Execution  │
                    │  Algorithmic Robot  │
                    └─────────────────────┘
```

-----

## Instruments Covered

- **Commodities** — BRENT Crude · WTI Crude · Natural Gas · Refined Products
- **FX Pairs** — Major and commodity-correlated pairs
- **Equities** — Energy sector and MCC Capital portfolio positions

-----

## Governance

NAFTAhub operates within the **MCC Capital** institutional framework:

- Risk & Compliance oversight: **Bildenberg Limited** (Hong Kong SAR)
- Fiduciary structuring: **Treuhand AG Limited**
- Parent operating group: **MCC Capital · MCC Petroli · MCC Oil & Gas**

-----

## Related Projects

- [NQAi](https://github.com/your-username/NQAi) — Neural Quantum Artificial Intelligence pipeline
- [ATOS](https://github.com/your-username/ATOS) — Autonomous Trading Operating System
- [cTrader Robot](https://github.com/your-username/cTrader-Robot) — Algorithmic execution engine

-----

*NAFTAhub — Automating the infrastructure of institutional fuels trade.*