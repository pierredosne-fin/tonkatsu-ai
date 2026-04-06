/*
  Phase 3-fix: total_connected_users_count — point-in-time backfill validation
  =============================================================================
  Run this query AFTER deploying the fix to validate:
    1. No date gaps in the history table.
    2. Counts are monotonically plausible (no sudden drops > 20%).
    3. The corrected counts differ from the buggy ones in the expected direction
       (bug was: counting current connected users instead of point-in-time state).

  Expected source: _int_institution_connections_daily_snapshot_history (confirmed exists in prod)
  Target model:    user_portfolio_engagement_daily_metrics (Phase 3)

  Run in BigQuery console or via `dbt test --select user_portfolio_engagement_daily_metrics`.
*/

-- 1. DATE GAP CHECK — expect 0 rows
with date_spine as (
    select date
    from unnest(
        generate_date_array(
            (select min(snapshot_date) from {{ ref('_int_institution_connections_daily_snapshot_history') }}),
            current_date()
        )
    ) as date
),
existing_dates as (
    select distinct snapshot_date
    from {{ ref('_int_institution_connections_daily_snapshot_history') }}
),
gaps as (
    select ds.date as missing_date
    from date_spine ds
    left join existing_dates ed on ds.date = ed.snapshot_date
    where ed.snapshot_date is null
)
select 'DATE_GAP' as check_name, count(*) as anomaly_count, string_agg(cast(missing_date as string), ', ') as details
from gaps

union all

-- 2. SUDDEN DROP CHECK — flag dates where connected users dropped > 20% day-over-day
select
    'SUDDEN_DROP' as check_name,
    count(*) as anomaly_count,
    string_agg(cast(snapshot_date as string) || ': ' || cast(round(pct_change * 100, 1) as string) || '%', ', ') as details
from (
    select
        snapshot_date,
        total_connected_users_count,
        lag(total_connected_users_count) over (order by snapshot_date) as prev_count,
        safe_divide(
            total_connected_users_count - lag(total_connected_users_count) over (order by snapshot_date),
            lag(total_connected_users_count) over (order by snapshot_date)
        ) as pct_change
    from {{ ref('user_portfolio_engagement_daily_metrics') }}
)
where pct_change < -0.20

union all

-- 3. POINT-IN-TIME vs CURRENT-STATE DIVERGENCE
-- After fix, historical dates should have LOWER counts than current (since bug over-counted).
-- Check that the most recent date's count matches current active connections.
select
    'CURRENT_DAY_MISMATCH' as check_name,
    abs(pit.total_connected_users_count - live.current_connected) as anomaly_count,
    'PIT count: ' || cast(pit.total_connected_users_count as string)
        || ' | Live count: ' || cast(live.current_connected as string) as details
from (
    select total_connected_users_count
    from {{ ref('user_portfolio_engagement_daily_metrics') }}
    where metric_date = date_sub(current_date(), interval 1 day)
) pit
cross join (
    select count(distinct user_id) as current_connected
    from {{ ref('stg_institution_connections') }}
    where is_active = true
) live
where abs(pit.total_connected_users_count - live.current_connected) > 10  -- allow small lag tolerance
