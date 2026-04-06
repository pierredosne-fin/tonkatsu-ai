{{
    config(
        materialized='table',
        tags=['ltv', 'ml', 'scoring', 'phase7']
    )
}}

/*
  user_ltv_predictions — Phase 7
  ML-ready LTV scoring features + rule-based LTV buckets for BI.
  Grain: one row per user_id (latest state).

  This model serves two purposes:
    1. Feature store export for the ML model (all feature columns).
    2. BI-consumable LTV tier (high/medium/low) based on rule-based proxy
       until the ML model is deployed and writes back scores.

  LTV proxy formula (rule-based until ML):
    predicted_ltv_usd = arpu_30d * estimated_lifetime_months
    estimated_lifetime_months = 1 / monthly_churn_rate_segment

  ML score column (ltv_ml_score_usd) is left null until the ML pipeline
  writes scores back to BigQuery via an external job.

  Features included:
    - User demographics: plan_type, days_since_signup, country
    - Activation: has_connected_account, days_to_first_connection
    - Engagement: avg_sessions_per_week_30d, portfolio_views_30d
    - Monetisation: is_paying, current_mrr_usd, months_as_paid
    - Retention signals: d7_retained, d30_retained, streak_days
    - Referral / social: referred_users_count (if available)
*/

with user_base as (
    select
        user_id,
        created_at,
        plan_type,
        country_code,
        date_diff(current_date(), date(created_at), day)    as days_since_signup
    from {{ ref('stg_users') }}
),

-- Latest subscription state
sub_state as (
    select
        user_id,
        is_active                                           as is_paying,
        mrr_usd                                             as current_mrr_usd,
        date_diff(current_date(), date(first_paid_at), month) as months_as_paid
    from {{ ref('user_subscription_daily_snapshot_history') }}
    where snapshot_date = date_sub(current_date(), interval 1 day)
),

-- Institution connection signals
connection_signals as (
    select
        user_id,
        count(distinct institution_id) > 0                  as has_connected_account,
        min(date_diff(date(first_connected_at), date(signup_at), day))
                                                            as days_to_first_connection,
        count(distinct institution_id)                      as connected_accounts_count
    from {{ ref('_int_institution_connections_daily_snapshot_history') }}
    where snapshot_date = date_sub(current_date(), interval 1 day)
      and is_active = true
    group by 1
),

-- Engagement signals (last 30 days)
engagement_signals as (
    select
        user_id,
        count(session_id)                                                   as sessions_30d,
        safe_divide(count(session_id), 4.0)                                 as avg_sessions_per_week_30d,
        countif(event_type = 'portfolio_view')                              as portfolio_views_30d,
        max(date(session_start_at))                                         as last_active_date,
        date_diff(current_date(), max(date(session_start_at)), day)         as days_since_last_session
    from {{ ref('stg_sessions') }}
    where session_start_at >= timestamp_sub(current_timestamp(), interval 30 day)
    group by 1
),

-- Retention flags (from cohort model if available, else recompute)
retention_signals as (
    select
        user_id,
        retained_d7,
        retained_d30,
        -- Streak: consecutive days with a session (simplified: days in last 7 with session)
        null as streak_days  -- placeholder; requires session daily spine
    from (
        select
            user_id,
            max(case when days_since_signup between 1 and 7  then 1 else 0 end) as retained_d7,
            max(case when days_since_signup between 1 and 30 then 1 else 0 end) as retained_d30
        from (
            select
                s.user_id,
                date_diff(date(s.session_start_at), date(u.created_at), day) as days_since_signup
            from {{ ref('stg_sessions') }} s
            join {{ ref('stg_users') }} u on s.user_id = u.user_id
        )
        group by 1
    )
),

-- LTV proxy computation (rule-based)
ltv_proxy as (
    select
        u.user_id,
        -- Monthly churn rate by plan segment (historical averages — update quarterly)
        case
            when coalesce(ss.months_as_paid, 0) >= 12 then 0.02   -- long-term paid: 2% monthly churn
            when coalesce(ss.months_as_paid, 0) >= 3  then 0.05   -- established paid: 5%
            when ss.is_paying = true                   then 0.10   -- new paid: 10%
            else                                            0.30   -- free: 30% (potential conversion)
        end as monthly_churn_rate,

        coalesce(ss.current_mrr_usd, 0) as arpu_for_ltv,

        -- Estimated lifetime months = 1 / churn rate
        safe_divide(1, case
            when coalesce(ss.months_as_paid, 0) >= 12 then 0.02
            when coalesce(ss.months_as_paid, 0) >= 3  then 0.05
            when ss.is_paying = true                   then 0.10
            else 0.30
        end) as estimated_lifetime_months

    from user_base u
    left join sub_state ss on u.user_id = ss.user_id
),

final as (
    select
        u.user_id,
        u.created_at,
        u.plan_type,
        u.country_code,
        u.days_since_signup,

        -- Monetisation
        coalesce(ss.is_paying, false)                       as is_paying,
        coalesce(ss.current_mrr_usd, 0)                     as current_mrr_usd,
        coalesce(ss.months_as_paid, 0)                      as months_as_paid,

        -- Activation
        coalesce(cs.has_connected_account, false)           as has_connected_account,
        cs.days_to_first_connection,
        coalesce(cs.connected_accounts_count, 0)            as connected_accounts_count,

        -- Engagement
        coalesce(es.sessions_30d, 0)                        as sessions_30d,
        coalesce(es.avg_sessions_per_week_30d, 0)           as avg_sessions_per_week_30d,
        coalesce(es.portfolio_views_30d, 0)                 as portfolio_views_30d,
        es.last_active_date,
        coalesce(es.days_since_last_session, u.days_since_signup) as days_since_last_session,

        -- Retention
        coalesce(rs.retained_d7, 0)                         as retained_d7,
        coalesce(rs.retained_d30, 0)                        as retained_d30,

        -- LTV proxy
        lp.monthly_churn_rate,
        lp.estimated_lifetime_months,
        lp.arpu_for_ltv * lp.estimated_lifetime_months      as predicted_ltv_usd_rule_based,

        -- ML score placeholder (overwritten by ML pipeline)
        cast(null as float64)                               as ltv_ml_score_usd,

        -- LTV tier (based on rule-based until ML score available)
        case
            when lp.arpu_for_ltv * lp.estimated_lifetime_months >= 200 then 'high'
            when lp.arpu_for_ltv * lp.estimated_lifetime_months >= 50  then 'medium'
            else 'low'
        end                                                 as ltv_tier,

        current_timestamp()                                 as scored_at
    from user_base u
    left join sub_state ss         on u.user_id = ss.user_id
    left join connection_signals cs on u.user_id = cs.user_id
    left join engagement_signals es on u.user_id = es.user_id
    left join retention_signals rs  on u.user_id = rs.user_id
    left join ltv_proxy lp          on u.user_id = lp.user_id
)

select
    {{ dbt_utils.generate_surrogate_key(['user_id']) }} as ltv_prediction_id,
    *
from final
