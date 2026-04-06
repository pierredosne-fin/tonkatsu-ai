/*
  LOGIN / SESSION EVENT AVAILABILITY VALIDATION
  =============================================
  Run in BigQuery console before deploying Phase 4 and MPEU Phase 3 fix.
  Purpose: confirm that a per-user, per-day login signal exists and is usable.

  We need:
    - table with (user_id, timestamp) grain
    - enough history (ideally 90d+) for D7/D30/D90 cohort windows
    - event that reliably fires on login (not page-view, not background sync)

  Candidate locations to check, in priority order:
    1. BigQuery `track` schema  — Segment/Rudderstack event stream
    2. BigQuery `stg_sessions`  — if a sessions staging model already exists
    3. Postgres `analytics.sessions` or `public.user_sessions` — transactional DB
*/

-- ============================================================
-- CHECK 1: Does `track.pages` or `track.identifies` exist?
-- Run this block in the `track` dataset in BigQuery.
-- ============================================================
select
    'track.identifies' as candidate_table,
    count(*)           as total_rows,
    count(distinct user_id) as distinct_users,
    min(timestamp)     as earliest_event,
    max(timestamp)     as latest_event,
    date_diff(current_date(), date(min(timestamp)), day) as history_days
from `track.identifies`

union all

select
    'track.pages',
    count(*),
    count(distinct user_id),
    min(timestamp),
    max(timestamp),
    date_diff(current_date(), date(min(timestamp)), day)
from `track.pages`

union all

-- Check for a dedicated login/session event
select
    'track.events (login)',
    count(*),
    count(distinct user_id),
    min(timestamp),
    max(timestamp),
    date_diff(current_date(), date(min(timestamp)), day)
from `track.events`
where event = 'login'
   or event = 'session_start'
   or event = 'app_open'
;

-- ============================================================
-- CHECK 2: Per-user, per-day login count sample (last 30d)
-- If the above returns results, run this to validate grain.
-- ============================================================
select
    user_id,
    date(timestamp)       as login_date,
    count(*)              as login_events_that_day
from `track.identifies`   -- replace with correct table from check 1
where timestamp >= timestamp_sub(current_timestamp(), interval 30 day)
  and user_id is not null
group by 1, 2
order by login_date desc
limit 100;

-- ============================================================
-- CHECK 3: Is stg_sessions already materialized in dbt?
-- Run in BigQuery dbt dataset.
-- ============================================================
select
    'stg_sessions exists' as check_name,
    count(*) as row_count,
    count(distinct user_id) as distinct_users,
    min(session_start_at) as earliest,
    max(session_start_at) as latest,
    array_agg(distinct column_name ignore nulls order by column_name) as columns
from `<dbt_dataset>.stg_sessions`,
     unnest([
         case when user_id is not null then 'user_id' end,
         case when session_start_at is not null then 'session_start_at' end,
         case when session_id is not null then 'session_id' end
     ]) as column_name
where column_name is not null
limit 1;

-- ============================================================
-- CHECK 4: MPEU signal quality — users with ≥2 logins in 30d
-- Run once CHECK 1 source is confirmed.
-- ============================================================
with daily_logins as (
    select
        user_id,
        date(timestamp) as login_date
    from `track.identifies`   -- replace as needed
    where timestamp >= timestamp_sub(current_timestamp(), interval 30 day)
      and user_id is not null
    group by 1, 2   -- deduplicate to 1 login per user per day
),
mpeu_candidates as (
    select
        user_id,
        count(distinct login_date) as login_days_in_30d
    from daily_logins
    group by 1
)
select
    count_if(login_days_in_30d >= 2) as mpeu_eligible_users,
    count(*)                          as total_active_users_30d,
    safe_divide(count_if(login_days_in_30d >= 2), count(*)) as mpeu_ratio
from mpeu_candidates;

/*
  EXPECTED OUTCOME:
  - stg_sessions or track.identifies should exist with session_start_at (or timestamp) + user_id
  - history ≥ 90 days (for D90 cohort windows)
  - mpeu_ratio should be > 0 and < 1 (sanity check)

  REPORT BACK:
  - table name confirmed
  - key fields: user_id column name, timestamp column name, session_id if exists
  - history depth (days)
  - mpeu_eligible_users count (rough)
  - any SLA/refresh lag (how fresh is data?)
*/
