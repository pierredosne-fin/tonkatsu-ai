{{
    config(
        materialized='incremental',
        unique_key='cohort_metric_id',
        partition_by={'field': 'cohort_date', 'data_type': 'date'},
        cluster_by=['cohort_date', 'plan_type_at_signup'],
        tags=['retention', 'cohort', 'weekly_kpi']
    )
}}

/*
  user_retention_cohort_metrics — Phase 4
  D7/D30/D90 retention by signup cohort.
  Grain: one row per cohort_date x plan_type_at_signup x retention_period.
  Incremental: reprocesses cohorts where the retention window is now complete.
*/

with cohorts as (
    select
        user_id,
        date_trunc(created_at, week) as cohort_date,
        plan_type                    as plan_type_at_signup,
        created_at                   as signup_at
    from {{ ref('stg_users') }}
    where created_at is not null
),

logins as (
    select
        user_id,
        date(session_start_at) as login_date
    from {{ ref('stg_sessions') }}
    where session_start_at is not null
),

-- For each user, determine first login date after signup (day 0 = signup day)
user_activity as (
    select
        c.user_id,
        c.cohort_date,
        c.plan_type_at_signup,
        c.signup_at,
        l.login_date,
        date_diff(l.login_date, date(c.signup_at), day) as days_since_signup
    from cohorts c
    left join logins l
        on c.user_id = l.user_id
        and l.login_date >= date(c.signup_at)
),

retention_flags as (
    select
        user_id,
        cohort_date,
        plan_type_at_signup,
        signup_at,
        max(case when days_since_signup between 1  and 7  then 1 else 0 end) as retained_d7,
        max(case when days_since_signup between 1  and 30 then 1 else 0 end) as retained_d30,
        max(case when days_since_signup between 1  and 90 then 1 else 0 end) as retained_d90
    from user_activity
    group by 1, 2, 3, 4
),

cohort_sizes as (
    select
        cohort_date,
        plan_type_at_signup,
        count(distinct user_id) as cohort_size
    from cohorts
    group by 1, 2
),

aggregated as (
    select
        r.cohort_date,
        r.plan_type_at_signup,
        cs.cohort_size,

        -- D7
        countif(r.retained_d7 = 1)                                  as retained_users_d7,
        safe_divide(countif(r.retained_d7 = 1), cs.cohort_size)     as retention_rate_d7,

        -- D30
        countif(r.retained_d30 = 1)                                 as retained_users_d30,
        safe_divide(countif(r.retained_d30 = 1), cs.cohort_size)    as retention_rate_d30,

        -- D90
        countif(r.retained_d90 = 1)                                 as retained_users_d90,
        safe_divide(countif(r.retained_d90 = 1), cs.cohort_size)    as retention_rate_d90,

        current_timestamp()                                          as updated_at
    from retention_flags r
    join cohort_sizes cs
        on r.cohort_date = cs.cohort_date
        and r.plan_type_at_signup = cs.plan_type_at_signup
    group by 1, 2, 3
)

select
    {{ dbt_utils.generate_surrogate_key(['cohort_date', 'plan_type_at_signup']) }} as cohort_metric_id,
    cohort_date,
    plan_type_at_signup,
    cohort_size,
    retained_users_d7,
    retention_rate_d7,
    retained_users_d30,
    retention_rate_d30,
    retained_users_d90,
    retention_rate_d90,
    updated_at
from aggregated

{% if is_incremental() %}
-- Only reprocess cohorts where D90 window is now completable (cohort ≥ 90 days old)
-- and cohort is newer than last run (to catch recent cohorts once their window closes)
where cohort_date <= date_sub(current_date(), interval 90 day)
  and cohort_date > (select max(cohort_date) from {{ this }})
{% endif %}
