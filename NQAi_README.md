# NQAi

### Neural Quantum Artificial Intelligence

> A five-layer decision intelligence pipeline for autonomous trading, confidence scoring, and AI-directed capital execution  the intelligence core of the **ATOS** framework.

-----

## Overview

NQAi (Neural Quantum Artificial Intelligence) is the AI decision engine that powers the Autonomous Trading Operating System (ATOS). It processes market signals through a structured five-layer intelligence pipeline, producing confidence-scored trade signals consumed by the cTrader algorithmic execution robot.

NQAi combines classical machine learning, ensemble methods, and quantum-inspired oscillation theory to achieve institutional-grade signal generation across multi-asset environments.

-----

## Five-Layer Intelligence Pipeline

```
Layer 1 — Signal Ingestion & Feature Engineering
    │  Market data · Order flow · Macro indicators · Sentiment
    ▼
Layer 2 — Temporal Pattern Recognition
    │  Transformer + LSTM · DFT Cycle Analysis · HMM + XGBoost
    ▼
Layer 3 — Volatility & Regime Classification
    │  GARCH-Neural Hybrid · Market Curvature Detection
    │  Quantum Oscillation Theory
    ▼
Layer 4 — Network & Relational Intelligence
    │  Graph Neural Network (GNN) · Cross-asset correlation mapping
    │  Accumulation Node Computation
    ▼
Layer 5 — Execution Decision & Confidence Scoring
       RL Agents · FinBERT Sentiment · Temporal Zoom Gate
       Micro-Position Grid · Final NQAi Confidence Score ──▶ cTrader
```

-----

## Model Architecture Classes

|Class         |Architecture        |Primary Function                |
|--------------|--------------------|--------------------------------|
|**Temporal**  |Transformer + LSTM  |Sequential pattern recognition  |
|**Regime**    |HMM + XGBoost       |Market state classification     |
|**Volatility**|GARCH-Neural        |Risk-adjusted signal generation |
|**Relational**|Graph Neural Network|Cross-asset dependency mapping  |
|**Execution** |RL Agents           |Optimal entry/exit decisions    |
|**Sentiment** |FinBERT             |News and macro sentiment parsing|

-----

## Quantum Oscillation Theory Components

NQAi integrates a Quantum Oscillation Theory (QOT) architecture with the following modules:

- **DFT Cycle Analysis** — Discrete Fourier Transform decomposition of price cycles
- **Accumulation Node Computation** — Detection of institutional accumulation zones
- **Market Curvature Detection** — Second-derivative curvature analysis of price trajectories
- **Temporal Zoom Gate** — Adaptive multi-timeframe resolution switching
- **Micro-Position Grid** — Granular entry scaffolding within high-confidence zones

-----

## NQAi Confidence Score

Every trade signal produced by NQAi carries a **multi-layer confidence score** (0–100) aggregated across all five pipeline layers. This score drives:

- Position sizing within the micro-position grid
- Risk gate pass/fail decisions
- cTrader robot execution parameters

-----

## Integration

```
NQAi ──▶ NAFTAhub (Trade Infrastructure)
     ──▶ cTrader Robot (Algorithmic Execution)
     ─▶ ATOS Dashboard (Institutional Monitoring)
```

-----

## Deployment Infrastructure

- **Primary Region**: Frankfurt (DE)
- **Cluster Architecture**: Six named hardware clusters (A–F), five-tier logical architecture
- **Geographic Redundancy**: Four-region deployment
- **Capital Scaling**: €1M seed → €10B+ institutional

-----

## Related Projects

- [NAFTAhub](https://github.com/your-username/NAFTAhub) — Fuels trade automation platform
- [ATOS](https://github.com/your-username/ATOS) — Autonomous Trading Operating System
- [cTrader Robot](https://github.com/your-username/cTrader-Robot) — Execution engine (.algo)

-----

*NQAi — Neural intelligence for autonomous capital execution.*