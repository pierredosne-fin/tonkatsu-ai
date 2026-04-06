# Deploy Runbook — Phases 3-fix, 4, 5, 6

**Date:** 2026-04-06  
**Deployer:** requires write access to `/Users/pierredosne/dev/projects/data-platform-dbt`

---

## Pre-deploy checklist

- [ ] Confirm `stg_sessions` exists in dbt dataset (run `login_availability_validation.sql` CHECK 3)
- [ ] Confirm `stg_experiment_assignments` exists or stub it (see Phase 6 note in model)
- [ ] Confirm `stg_subscription_changes` exists (needed by Phase 5 expansion/contraction MRR)
- [ ] Copy model files from `outputs/models/public/` into the correct dbt models directory
- [ ] Copy `outputs/models/schema_phases4_6.yml` into the models directory alongside the SQL

---

## Step 1 — Phase 3-fix: total_connected_users_count backfill

```bash
# Deploy the fix
dbt run --select user_portfolio_engagement_daily_metrics --full-refresh

# Validate
# Run outputs/models/public/total_connected_users_count_backfill_validation.sql in BigQuery console
# Expect: DATE_GAP = 0, SUDDEN_DROP = 0, CURRENT_DAY_MISMATCH < 10
```

---

## Step 2 — Phase 4: user_retention_cohort_metrics

```bash
# First run (full history — model uses incremental but needs initial load)
dbt run --select user_retention_cohort_metrics --full-refresh

# Tests
dbt test --select user_retention_cohort_metrics

# Sanity check — run in BigQuery after deploy:
SELECT
  cohort_date,
  plan_type_at_signup,
  cohort_size,
  retained_users_d7,
  round(retention_rate_d7, 3) as retention_rate_d7
FROM `<dataset>.user_retention_cohort_metrics`
WHERE cohort_date >= date_sub(current_date(), interval 56 day)  -- 8 weeks
ORDER BY cohort_date DESC;
-- Expected: 8 rows per plan_type, retention_rate_d7 between 0.10 and 0.80
```

---

## Step 3 — Phase 5: revenue_daily_metrics

```bash
dbt run --select revenue_daily_metrics --full-refresh
dbt test --select revenue_daily_metrics

# Sanity check
SELECT
  metric_date,
  mrr_usd,
  active_subscribers,
  round(arpu_usd, 2) as arpu_usd,
  round(nrr_trailing_30d, 3) as nrr_trailing_30d
FROM `<dataset>.revenue_daily_metrics`
ORDER BY metric_date DESC
LIMIT 30;
-- Expected: mrr_usd > 0, arpu_usd > 0, nrr_trailing_30d between 0.5 and 1.5
```

---

## Step 4 — Phase 6: experiment_results

**BLOCKER:** `stg_experiment_assignments` must exist first.

If not yet created, add a stub to allow compilation:
```sql
-- models/stg/stg_experiment_assignments.sql
select
  cast(null as string) as user_id,
  cast(null as string) as experiment_id,
  cast(null as string) as variant,
  cast(null as timestamp) as assigned_at
where false
```

Then:
```bash
dbt run --select stg_experiment_assignments experiment_results
dbt test --select experiment_results
```

---

## Login availability — action required before MPEU finalization

Run `outputs/login_availability_validation.sql` in BigQuery console.  
Report back:
- Confirmed table name (likely `track.identifies` or `stg_sessions`)
- `session_start_at` column name
- History depth (need ≥ 90 days for D90 cohorts)
- MPEU eligible user count

Until confirmed, `stg_sessions` ref in Phase 4 and Phase 6 models is an **assumption**.

---

## Deploy order

```
Phase 3-fix → Phase 4 → Phase 5 → Phase 6 (after stg_experiment_assignments confirmed)
```
