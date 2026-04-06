# dbt Phases 3-fix through 7 — Deployment Runbook
**Date:** 2026-04-06  
**Author:** Analytics Engineer  
**Platform:** BigQuery + dbt (medallion: base→stg→_int→tmp→public)

---

## Pre-flight checklist

- [ ] Verify `stg_sessions` exists with columns: `user_id`, `session_id`, `session_start_at`
- [ ] Verify `stg_subscriptions` has: `user_id`, `mrr_usd`, `started_at`, `cancelled_at`, `is_first_subscription`, `is_active`
- [ ] Verify `stg_subscription_changes` has: `user_id`, `upgraded_at`, `downgraded_at`, `mrr_delta_usd`, `change_type`
- [ ] Verify `stg_experiment_assignments` + `stg_experiment_events` exist (Phase 6 only — skip if not ready)
- [ ] Run `dbt compile` and confirm no ref() resolution errors
- [ ] Confirm BigQuery service account has write access to the target dataset

---

## Phase 3-fix: total_connected_users_count backfill

**Problem:** `user_portfolio_engagement_daily_metrics.total_connected_users_count` was counting current-state users, not point-in-time. The fix relies on `_int_institution_connections_daily_snapshot_history` (confirmed exists).

```bash
# 1. Full refresh the engagement model to recompute all historical dates
dbt run --select user_portfolio_engagement_daily_metrics --full-refresh

# 2. Run backfill validation
dbt run-operation run_query --args '{query_file: "models/public/total_connected_users_count_backfill_validation.sql"}'
# OR run the validation SQL directly in BigQuery console

# 3. Check expected output:
#    - DATE_GAP: anomaly_count = 0
#    - SUDDEN_DROP: anomaly_count = 0 (or investigate any flagged dates)
#    - CURRENT_DAY_MISMATCH: anomaly_count < 10
```

---

## Phase 4: user_retention_cohort_metrics

**Sources:** `stg_users`, `stg_sessions`  
**Grain:** cohort_date (week) × plan_type_at_signup  
**Incremental strategy:** Processes cohorts ≥90 days old with new data

```bash
# First deploy (full history)
dbt run --select user_retention_cohort_metrics --full-refresh

# Validate
dbt test --select user_retention_cohort_metrics

# Sanity check: D7 retention should be 30-60% for free users, 50-75% for paid
```

**Metabase:** Create a bar chart on `retention_rate_d7` by `cohort_date`, filtered by `plan_type_at_signup`.

---

## Phase 5: revenue_daily_metrics

**Sources:** `user_subscription_daily_snapshot_history`, `stg_subscriptions`, `stg_subscription_changes`  
**Grain:** metric_date  
**Note:** `stg_subscription_changes` may need to be created if it doesn't exist. Check if upgrade/downgrade events are tracked in RevenueCat events or a separate table.

```bash
# First deploy
dbt run --select revenue_daily_metrics --full-refresh

# Validate
dbt test --select revenue_daily_metrics

# Cross-check: MRR on most recent date should match existing paid_customer model
SELECT mrr_usd FROM revenue_daily_metrics WHERE metric_date = CURRENT_DATE() - 1;
SELECT SUM(mrr) FROM paid_customer WHERE is_active = true;  -- should be close
```

---

## Phase 6: experiment_results

**Prerequisite:** `stg_experiment_assignments` must exist.  
**If not ready:** Skip Phase 6 and deploy Phase 7 first.

```bash
dbt run --select experiment_results

dbt test --select experiment_results

# Verify: each experiment_id has a 'control' variant
SELECT experiment_id, COUNT(DISTINCT variant)
FROM experiment_results
GROUP BY 1
HAVING COUNTIF(variant = 'control') = 0;  -- expect 0 rows
```

---

## Phase 7: user_ltv_predictions

**Sources:** `stg_users`, `user_subscription_daily_snapshot_history`, `_int_institution_connections_daily_snapshot_history`, `stg_sessions`  
**Grain:** user_id (one row per user, full refresh daily)  
**Orchestration:** Schedule as daily full-refresh (not incremental)

```bash
dbt run --select user_ltv_predictions

dbt test --select user_ltv_predictions

# Sanity checks
SELECT ltv_tier, COUNT(*) FROM user_ltv_predictions GROUP BY 1;
-- Expect majority in 'low' tier, small % in 'high'

SELECT AVG(predicted_ltv_usd_rule_based) FROM user_ltv_predictions WHERE is_paying = true;
-- Should be > 0
```

**ML handoff:** Once ML pipeline is ready, it should:
1. Read features from `user_ltv_predictions`
2. Write scores back to a staging table `stg_ltv_ml_scores(user_id, ltv_ml_score_usd, scored_at)`
3. The model will be updated to join that table and populate `ltv_ml_score_usd`

---

## Orchestration (add to dbt schedule)

```
Daily 03:00 UTC:
  1. stg_* models (base layer)
  2. _int_institution_connections_daily_snapshot_history
  3. user_portfolio_engagement_daily_metrics
  4. user_activation_daily_metrics
  5. user_subscription_daily_snapshot_history
  6. user_retention_cohort_metrics       ← Phase 4 (NEW)
  7. revenue_daily_metrics               ← Phase 5 (NEW)
  8. user_ltv_predictions                ← Phase 7 (NEW, full refresh)

Weekly (or on-demand):
  - experiment_results                   ← Phase 6 (NEW, table refresh)
```

---

## Known assumptions / TODOs

| Item | Status | Notes |
|------|--------|-------|
| `stg_sessions.event_type` column | Unverified | Used in `user_ltv_predictions` for portfolio_views. Confirm column name. |
| `stg_subscription_changes` | May not exist | May need to derive from `stg_subscriptions` deltas instead |
| `stg_experiment_assignments` | Unknown | Confirm table exists before deploying Phase 6 |
| `ltv_ml_score_usd` ML writeback | Future | Coordinate with ML team on schema for score writeback |
| `retention_rate_d7` / `d30` columns in `user_ltv_predictions` | Naming | Schema.yml uses `retention_rate_*` but SQL uses `retained_d*` — align before deploy |
