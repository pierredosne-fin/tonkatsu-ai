# Finary Data Strategy
*Head of Data — April 2026*

---

## Mission

Turn data into Finary's compound advantage: faster product decisions, higher retention, and a monetization engine that scales without adding headcount.

---

## North Star

**MPEU — Monthly Portfolio-Engaged Users**
Users with ≥1 active connected account AND ≥2 logins in the past 30 days.

Why it matters: captures the core value loop (connect → track → return), predicts conversion and retention better than MAU or MRR, and aligns every team around the same outcome.

---

## Strategic Pillars

### 1. Measurement Foundation (NOW — H1 2026)
Ship a complete, trusted measurement layer. Nothing downstream is credible without this.

**Deliverables:**
- Deploy dbt Phases 4–5: cohort retention (`user_retention_cohort_metrics`) + revenue (`revenue_daily_metrics`)
- Validate and backfill `total_connected_users_count` point-in-time fix
- CEO weekly dashboard live in Metabase: MPEU, Activation Rate D7, Free→Paid D30/D60, MRR + NRR
- Single source of truth for each KPI — no competing definitions across teams

**Success signal:** CEO makes weekly decisions from the dashboard without questioning the numbers.

---

### 2. Product Analytics (H1–H2 2026)
Understand the activation and engagement funnel deeply enough to run experiments.

**Deliverables:**
- Funnel analysis: signup → first connection → second login → paid conversion
- Activation cohort analysis by acquisition channel, device, and onboarding path
- Session/event pipeline validated from Postgres/track — prerequisite for MPEU finalization
- Instrument 3–5 key in-product events currently unmeasured (identify via gap audit)

**Success signal:** Product team runs weekly reviews against funnel data and proposes hypotheses.

---

### 3. Experimentation (H2 2026)
Enable the team to learn faster than competitors.

**Deliverables:**
- Deploy dbt Phase 6: `experiment_results` — A/B test lift per variant
- Define experiment taxonomy (guardrail metrics, minimum detectable effect, duration calculator)
- First 3 experiments shipped end-to-end with data team involvement from design to readout
- Self-serve experiment analysis in Metabase for PMs

**Success signal:** Product ships and reads out one experiment per sprint without data team bottleneck.

---

### 4. Predictive Intelligence (H2 2026 → 2027)
Move from descriptive to predictive — surface insights before users churn or convert.

**Deliverables:**
- Deploy dbt Phase 7: `user_ltv_predictions` — ML LTV scoring
- Churn propensity model: flag users at risk 7–14 days before churning
- LTV-based segmentation fed into CRM (Customer.io) for lifecycle campaigns
- Revenue forecasting model: MRR projection with scenario bands

**Success signal:** Retention campaigns triggered by model scores outperform rule-based campaigns by ≥15% on retention rate.

---

### 5. Data Governance & Quality (Ongoing)
Trust is infrastructure. Build it continuously.

**Principles:**
- Every public dbt model has tests (not_null, unique, accepted_values, referential integrity)
- Anomaly alerting on KPI models — CEO dashboard never shows a broken number silently
- One owner per domain: activation (AE), revenue (AE), engagement (AE), dashboards (Analyst)
- Metric definitions documented in dbt schema.yml — no definition lives only in a Slack thread

---

## Team & Capabilities

| Role | Now | H2 2026 |
|---|---|---|
| Head of Data | Strategy, roadmap, governance | + Experimentation design, ML oversight |
| Analytics Engineer | dbt models Phases 4–7 | + ML feature engineering |
| Data Analyst | CEO dashboard, ad-hoc | + Self-serve onboarding for PM/Growth |

**Hiring trigger:** If experiment volume exceeds 4 concurrent tests OR the ML roadmap accelerates, hire a second AE or a dedicated Data Scientist.

---

## Stack

| Layer | Tool | Status |
|---|---|---|
| Warehouse | BigQuery | Production |
| Transformation | dbt (medallion: base→stg→_int→tmp→public) | Phases 1–3 live |
| BI | Metabase | CEO dashboard in progress |
| Subscriptions | RevenueCat | Production |
| Activation/Events | Postgres/track | Validation pending |
| CRM activation | Customer.io | Target for LTV integration |
| Experimentation | TBD (Statsig / internal) | H2 2026 |

---

## Roadmap Summary

| Phase | Timeline | Outcome |
|---|---|---|
| Foundation complete | May 2026 | CEO dashboard live, all KPIs trusted |
| Product analytics | June–July 2026 | Funnel + cohort analysis self-serve |
| Experimentation v1 | Sept 2026 | First 3 A/B tests analyzed end-to-end |
| Predictive models | Q4 2026 | Churn model in production, LTV scoring |
| Data-driven lifecycle | Q1 2027 | CRM campaigns triggered by model scores |

---

## What We Are Not Doing

- **No vanity dashboards.** Every chart must connect to a decision.
- **No premature ML.** Predictive work starts only after the measurement layer is stable.
- **No data lake sprawl.** Single warehouse (BigQuery), single transformation layer (dbt), single BI tool (Metabase) until scale demands otherwise.
- **No shadow analytics.** All KPI definitions live in dbt, not in spreadsheets or Notion pages.

---

## Definition of Done for This Strategy

This strategy is working when:
1. Every major product decision references data
2. The CEO dashboard is opened — not requested — every Monday
3. The data team unblocks experiments, not just reports on them
4. MPEU grows quarter-over-quarter as a direct result of insights surfaced by this team
