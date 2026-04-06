# LTV-Based User Segmentation Spec
*Growth Analyst | 2026-04-06*

## Goal
Segment users by predicted LTV to power Customer.io lifecycle campaigns that outperform rule-based campaigns by ≥15% on conversion/retention.

---

## Segmentation Model (Phase 7 Input)

### LTV Proxy Variables (available from existing models)
| Signal | Source Model | LTV Relevance |
|--------|-------------|---------------|
| Number of connected institutions | `user_portfolio_engagement_daily_metrics` | +LTV: more connections = stickier |
| Portfolio depth score (multi-asset) | `user_portfolio_engagement_daily_metrics` | +LTV: complexity drives need |
| Activation speed (hours to first connection) | `user_activation_daily_metrics` | +LTV: fast activators convert better |
| D7 login count | `user_retention_cohort_metrics` (Phase 4) | +LTV: early engagement predicts long-term |
| Subscription tier | `user_subscription_daily_snapshot_history` | Direct LTV signal |
| Churn risk (days since last login) | `user_portfolio_engagement_daily_metrics` | -LTV: lagging engagement |

### Segments (4-tier)

| Tier | Label | Criteria | Expected LTV |
|------|-------|----------|-------------|
| T1 | High-LTV | Multi-asset connected, D7 logins ≥3, activated D0-D2 | €150+ LTV est. |
| T2 | Growth | 1-2 connections, D7 logins ≥2, activated D0-D7 | €60–150 LTV est. |
| T3 | At-Risk | Connected but D30 logins <2 (lapsing MPEU) | €20–60 LTV est. |
| T4 | Dormant | No connection OR 0 logins D30+ | <€20 LTV est. |

---

## Customer.io Campaign Mapping

| Segment | Campaign | Trigger | Goal |
|---------|----------|---------|------|
| T1 High-LTV | Upsell Premium | D7 after T1 classification | Paid conversion |
| T2 Growth | Connection nudge | D3 if <2 connections | Deepen engagement |
| T3 At-Risk | Re-engagement | D14 since last login | Return to MPEU |
| T4 Dormant | Win-back | D30 since last login | Connection CTA |

---

## Baseline vs. Model-Triggered Campaign Comparison

### Current (Rule-Based) Baseline
- At-Risk campaign: triggered at "no login in 14 days" → flat rule
- Win-back: "no login in 30 days" → flat rule
- Estimated baseline conversion rate: TBD (need Customer.io actuals)

### Model-Triggered (Phase 7) Approach
- Trigger based on predicted LTV score AND churn probability score
- Only contact T1/T2 users with upsell (avoid wasting sends on low-LTV)
- Earlier T3 trigger: lapsing MPEU users get D10 (not D14) signal with personalized message

### Validation Experiment (Retention Campaign A/B)
- Control: current rule-based triggers
- Treatment: model score-based triggers (Phase 7 output)
- Primary metric: 30-day paid conversion rate from campaign
- Success threshold: +15% relative lift vs. control
- Guardrail: unsubscribe rate must not increase >1pp

---

## Data Requirements

| Need | Phase | Status |
|------|-------|--------|
| D7 cohort retention by user | Phase 4 | 🔨 Pending deploy |
| LTV prediction scores per user | Phase 7 | ⬜ Not started |
| Customer.io segment sync (webhook/API) | Infra | ❓ Unknown — needs Product |
| Campaign performance data in dbt | Phase 6+ | ⬜ Not started |

---

## Next Steps
1. Deploy Phase 4 → compute T3/T4 segment size today (how many at-risk?)
2. Phase 7 LTV model spec → delegate to Analytics Engineer once Phase 4+5 live
3. Agree Customer.io sync mechanism with Product/Engineering
