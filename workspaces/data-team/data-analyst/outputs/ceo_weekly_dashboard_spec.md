# CEO Weekly Dashboard — Specification
_Last updated: 2026-04-06 (rev 2 — column schemas confirmed by AE) | Data Analyst: Finary_

## Purpose
Single source of truth for company health. Reviewed every Monday by CEO + leadership. Every panel connects to a decision.

---

## Dashboard Layout (5 panels)

### Panel 1 — MPEU (North Star)
**Metric:** Monthly Portfolio-Engaged Users  
**Definition:** Distinct users with ≥1 active connected account AND ≥2 logins in the past 30 days (rolling)  
**Source model:** `public.user_portfolio_engagement_daily_metrics`  
**Metabase query:**
```sql
SELECT
  date,
  mpeu_count,
  mpeu_count - LAG(mpeu_count, 7) OVER (ORDER BY date) AS wow_delta,
  ROUND(100.0 * (mpeu_count - LAG(mpeu_count, 7) OVER (ORDER BY date)) 
        / NULLIF(LAG(mpeu_count, 7) OVER (ORDER BY date), 0), 1) AS wow_pct
FROM public.user_portfolio_engagement_daily_metrics
WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY date DESC
```
**Chart type:** Line chart (90-day trend) + single-stat for latest value and WoW %  
**Decision trigger:** WoW drop >5% → investigate churn or connection failures

---

### Panel 2 — Activation Rate D7
**Metric:** % of new signups retained at D7 (proxy for activation)  
**Definition:** `retained_users_d7 / cohort_size` by signup cohort week  
**Source model:** `public.user_retention_cohort_metrics` (Phase 4 🔨 pending deploy)  
**Status:** BLOCKED — requires Phase 4 deploy  
**Placeholder:** Use `user_activation_daily_metrics` (Phase 1 ✅) for raw signup counts only

**Query (once Phase 4 deployed):**
```sql
SELECT
  cohort_date AS cohort_week,
  SUM(cohort_size)           AS total_signups,
  SUM(retained_users_d7)     AS retained_d7,
  ROUND(100.0 * SUM(retained_users_d7) / NULLIF(SUM(cohort_size), 0), 1) AS retention_rate_d7_pct
FROM public.user_retention_cohort_metrics
WHERE cohort_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY 1
ORDER BY 1 DESC
```
**Confirmed columns:** `cohort_date`, `plan_type_at_signup`, `cohort_size`, `retained_users_d7`, `retention_rate_d7`, `retained_users_d30`, `retention_rate_d30`, `retained_users_d90`, `retention_rate_d90`  
**Chart type:** Bar chart by cohort week + trendline  
**Decision trigger:** Rate drops 2 weeks running → review onboarding funnel with Growth

---

### Panel 3 — Free-to-Paid Conversion D30 / D60
**Metric:** % of free users who convert to paid within 30 / 60 days of signup  
**Source model:** `public.user_subscription_daily_snapshot_history` (Phase 2 ✅)  
**Metabase query:**
```sql
SELECT
  DATE_TRUNC(signup_date, WEEK) AS cohort_week,
  COUNT(DISTINCT user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN days_to_conversion <= 30 THEN user_id END) AS converted_d30,
  COUNT(DISTINCT CASE WHEN days_to_conversion <= 60 THEN user_id END) AS converted_d60,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN days_to_conversion <= 30 THEN user_id END) 
        / COUNT(DISTINCT user_id), 2) AS conversion_rate_d30_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN days_to_conversion <= 60 THEN user_id END) 
        / COUNT(DISTINCT user_id), 2) AS conversion_rate_d60_pct
FROM public.user_subscription_daily_snapshot_history
WHERE signup_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 120 DAY)
GROUP BY 1
ORDER BY 1 DESC
```
**Chart type:** Dual-line chart (D30 vs D60 rates by cohort week)  
**Decision trigger:** D30 rate drops 2 weeks running → flag to Growth for paywall/pricing review

---

### Panel 4 — MRR
**Metric:** Monthly Recurring Revenue (end-of-week snapshot)  
**Source model:** `public.user_subscription_daily_snapshot_history` (Phase 2 ✅) / `public.revenue_daily_metrics` (Phase 5 🔨 pending deploy)  
**Status:** MRR queryable from Phase 2. Full NRR requires Phase 5.

**Available query:**
```sql
SELECT
  DATE_TRUNC(date, WEEK) AS week,
  SUM(mrr) AS mrr_eur,
  SUM(mrr) - LAG(SUM(mrr), 1) OVER (ORDER BY DATE_TRUNC(date, WEEK)) AS mrr_delta
FROM public.user_subscription_daily_snapshot_history
WHERE date = DATE_TRUNC(date, MONTH)  -- end-of-month point for MRR
  AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
GROUP BY 1
ORDER BY 1 DESC
```
**Chart type:** Bar chart (MRR by week) with delta annotation  
**Decision trigger:** MRR growth <2% MoM → deep-dive churn cohort

---

### Panel 5 — Net Revenue Retention (NRR)
**Metric:** NRR = (Starting MRR + Expansion - Contraction - Churn) / Starting MRR  
**Source model:** `public.revenue_daily_metrics` (Phase 5 🔨 pending deploy)  
**Status:** BLOCKED — requires Phase 5 deploy  
**Placeholder:** Show MRR churn rate from Phase 2 model as proxy until Phase 5 is live

**Proxy query (Phase 2, available now):**
```sql
SELECT
  DATE_TRUNC(date, MONTH) AS month,
  churned_mrr,
  total_mrr,
  ROUND(100.0 * churned_mrr / NULLIF(total_mrr, 0), 2) AS mrr_churn_rate_pct
FROM public.user_subscription_daily_snapshot_history
WHERE date = LAST_DAY(date)
  AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
ORDER BY 1 DESC
```

**Full NRR query (once Phase 5 deployed):**
```sql
SELECT
  DATE_TRUNC(metric_date, MONTH)                         AS month,
  MIN(mrr_usd)                                           AS starting_mrr,
  SUM(expansion_mrr_usd)                                 AS expansion,
  SUM(contraction_mrr_usd)                               AS contraction,
  SUM(churned_mrr_usd)                                   AS churn,
  ROUND(
    (MIN(mrr_usd) + SUM(expansion_mrr_usd) - SUM(contraction_mrr_usd) - SUM(churned_mrr_usd))
    / NULLIF(MIN(mrr_usd), 0),
  3) AS nrr_ratio,
  -- use nrr_trailing_30d for most recent month before month-end
  MAX(nrr_trailing_30d)                                  AS nrr_trailing_30d
FROM public.revenue_daily_metrics
WHERE metric_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
GROUP BY 1
ORDER BY 1 DESC
```
**Confirmed columns:** `metric_date`, `mrr_usd`, `new_mrr_usd`, `churned_mrr_usd`, `expansion_mrr_usd`, `contraction_mrr_usd`, `net_new_mrr_usd`, `nrr_trailing_30d`  
**Note:** No `starting_mrr` column — use `MIN(mrr_usd)` grouped by month as period-start MRR.

---

## Deployment Blockers

| Panel | KPI | Blocker | Owner |
|-------|-----|---------|-------|
| 1 | MPEU accuracy | Phase 3-fix `total_connected_users_count` backfill not deployed | Head of Data → grant AE write access |
| 2 | Activation Rate D7 | Phase 4 `user_retention_cohort_metrics` not deployed | Head of Data → authorize deploy |
| 5 | NRR | Phase 5 `revenue_daily_metrics` not deployed | Head of Data → authorize deploy |

**Root cause:** AE has SQL ready for all three but is sandboxed from `data-platform-dbt`. Write access must be granted by Head of Data.

**Column schemas confirmed by AE (2026-04-06) — queries are production-ready once deployed.**

---

## Refresh cadence
- Dashboard auto-refresh: Monday 07:00 CET (before leadership standup)
- Underlying models: daily dbt run (scheduled by AE)

## Self-serve notes for PMs/Growth
- All panels use Metabase filter: `date range` (default: last 90 days)
- Drill-through available on all cohort panels → click week to see user-level breakdown
- Questions → #data-analytics Slack channel
