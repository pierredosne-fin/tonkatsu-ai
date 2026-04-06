# Experiment 001 — Onboarding CTA Optimization
*Growth Analyst | 2026-04-06*

## Hypothesis
Replacing the generic "Connect your accounts" CTA with a personalized, benefit-focused prompt ("See your full net worth in 2 min") increases S0→S1 (First Connection) rate within D7.

## Why This Experiment
- S0→S1 is the highest-leverage drop-off: every point of improvement flows through the entire funnel
- Low engineering effort: copy/CTA change only, no backend changes
- Measurable within one sprint cycle

---

## Experiment Design

### Variants
| Variant | Description |
|---------|-------------|
| Control | Current onboarding CTA: "Connect your accounts" |
| Treatment | New CTA: "See your full net worth in 2 min" + benefit bullet list |

### Randomization
- Unit: user_id
- Assignment: 50/50 random split at signup
- Scope: all new signups (no holdout by channel)

### Primary Metric
**S0→S1 Activation Rate (D7)** — % of signups who connect ≥1 institution within 7 days

### Secondary Metrics
- S1→S2 Return Rate (D7) — quality check: activation must not degrade engagement
- D30 MPEU conversion — downstream health check

### Guardrail Metrics (must NOT degrade >2%)
- Signup completion rate (before the CTA) — detect form abandonment
- Day-1 retention — ensure experiment doesn't front-load then lose users

---

## Statistical Parameters

| Parameter | Value | Reasoning |
|-----------|-------|-----------|
| Baseline S0→S1 rate | ~35% | Estimated from industry benchmarks; update with actuals once Phase 4 live |
| Minimum Detectable Effect (MDE) | +5pp (absolute) | ~14% relative lift — meaningful for funnel math |
| Statistical power | 80% | Standard |
| Significance level (α) | 5% (two-tailed) | Standard |
| Required sample per variant | ~1,100 users | Formula: n = 2 × (z_α/2 + z_β)² × p(1-p) / MDE² |
| Estimated duration | ~2 weeks | Assumes ~100-150 new signups/day (validate against actuals) |

> **Sample size formula**: n = 2 × (1.96 + 0.84)² × 0.35 × 0.65 / 0.05² ≈ 1,087 per variant → ~2,200 total

---

## Readout Plan

| Day | Action |
|-----|--------|
| D1 | Validate instrumentation: variant assignment logged, no SRM |
| D7 | Check Sample Ratio Mismatch (SRM) — expected 50/50 ± 3% |
| D14 | Interim guardrail check (do not peek for primary metric) |
| D21 | Full readout: primary + secondary + guardrails |

**SRM Check**: χ² test on variant assignment counts. Abort if p < 0.01.

---

## Required Data Infrastructure

Needs `experiment_results` dbt model (Phase 6) with:
- `experiment_id`, `variant`, `user_id`, `assignment_date`
- joined to `user_activation_daily_metrics` for primary metric
- joined to `user_retention_cohort_metrics` for secondary metrics

---

## Decision Rules

| Outcome | Action |
|---------|--------|
| Treatment wins (primary +≥5pp, p<0.05, guardrails clean) | Ship to 100%, document |
| Treatment wins but guardrail violated | Hold, investigate, re-run with fix |
| No significant difference | Iterate copy, try different MDE |
| Treatment loses | Revert, test opposite direction |
