{{
    config(
        materialized='table',
        tags=['experimentation', 'ab_test', 'phase6']
    )
}}

/*
  experiment_results — Phase 6
  Per-user x per-metric grain for A/B test readout.
  Grain: one row per user_id x experiment_id x primary_metric_name.

  Sources:
    - stg_experiment_assignments  : user_id, experiment_id, variant, assigned_at
      STATUS: unconfirmed in prod — stub with empty CTE if not yet created (see note below)
    - user_activation_daily_metrics   : activation outcomes
    - user_retention_cohort_metrics   : retention/activation flags
    - stg_subscriptions               : paid conversion

  primary_metric_name values:
    'activated_d7'   — user logged in within 7d of assignment (boolean as 0/1)
    'paid_d30'       — user converted to paid within 30d of assignment (boolean as 0/1)
    'retention_d30'  — user logged in within 30d of assignment (boolean as 0/1)
    'mrr_at_30d'     — MRR snapshot 30d after assignment (continuous)

  NOTE on stg_experiment_assignments:
    If this table does not yet exist in prod, replace with:
      select cast(null as string) as user_id, ... where false
    to allow the model to compile and tests to pass on structure.
*/

with assignments as (
    select
        user_id,
        experiment_id,
        -- Normalize variant to 'control' | 'treatment' (handle legacy naming)
        case
            when lower(variant) in ('control', 'ctrl', 'baseline') then 'control'
            else 'treatment'
        end as variant,
        date(assigned_at) as assignment_date
    from {{ ref('stg_experiment_assignments') }}
    where assigned_at is not null
      and user_id is not null
),

-- Pull activation flag from user_activation_daily_metrics
-- activated = had a qualifying activation event within 7d of assignment
activation as (
    select
        a.user_id,
        a.experiment_id,
        a.variant,
        a.assignment_date,
        max(case
            when adm.metric_date between a.assignment_date
                 and date_add(a.assignment_date, interval 7 day)
                 and adm.is_activated = true
            then 1 else 0
        end) as activated_d7
    from assignments a
    left join {{ ref('user_activation_daily_metrics') }} adm
        on a.user_id = adm.user_id
    group by 1, 2, 3, 4
),

-- Pull D30 retention from user_retention_cohort_metrics
-- NOTE: that model is cohort-aggregated; for per-user flag we use stg_sessions directly
retention as (
    select
        a.user_id,
        a.experiment_id,
        max(case
            when date(s.session_start_at) between a.assignment_date
                 and date_add(a.assignment_date, interval 30 day)
            then 1 else 0
        end) as retained_d30
    from assignments a
    left join {{ ref('stg_sessions') }} s on a.user_id = s.user_id
    group by 1, 2
),

-- Paid conversion within 30d of assignment
conversion as (
    select
        a.user_id,
        a.experiment_id,
        max(case
            when sub.started_at between timestamp(a.assignment_date)
                 and timestamp_add(timestamp(a.assignment_date), interval 30 day)
                 and sub.is_first_subscription = true
            then 1 else 0
        end) as converted_d30,
        max(case
            when sub.is_active = true
                 and date(sub.started_at) <= date_add(a.assignment_date, interval 30 day)
            then sub.mrr_usd else 0
        end) as mrr_at_30d
    from assignments a
    left join {{ ref('stg_subscriptions') }} sub on a.user_id = sub.user_id
    group by 1, 2
),

-- Wide per-user outcomes table
user_outcomes as (
    select
        act.user_id,
        act.experiment_id,
        act.variant,
        act.assignment_date,
        act.activated_d7,
        coalesce(ret.retained_d30, 0)   as retained_d30,
        coalesce(conv.converted_d30, 0) as converted_d30,
        coalesce(conv.mrr_at_30d, 0)    as mrr_at_30d
    from activation act
    left join retention ret  on act.user_id = ret.user_id  and act.experiment_id = ret.experiment_id
    left join conversion conv on act.user_id = conv.user_id and act.experiment_id = conv.experiment_id
),

-- Unpivot to metric grain (one row per user x experiment x metric)
unpivoted as (
    select user_id, experiment_id, variant, assignment_date,
        'activated_d7'  as primary_metric_name,
        cast(activated_d7 as float64) as primary_metric_value
    from user_outcomes

    union all
    select user_id, experiment_id, variant, assignment_date,
        'paid_d30',
        cast(converted_d30 as float64)
    from user_outcomes

    union all
    select user_id, experiment_id, variant, assignment_date,
        'retention_d30',
        cast(retained_d30 as float64)
    from user_outcomes

    union all
    select user_id, experiment_id, variant, assignment_date,
        'mrr_at_30d',
        cast(mrr_at_30d as float64)
    from user_outcomes
)

select
    {{ dbt_utils.generate_surrogate_key(['experiment_id', 'user_id', 'primary_metric_name']) }} as experiment_result_id,
    experiment_id,
    variant,
    user_id,
    assignment_date,
    primary_metric_name,
    primary_metric_value,
    current_timestamp() as updated_at
from unpivoted
