{{
    config(
        materialized='incremental',
        unique_key='revenue_metric_id',
        partition_by={'field': 'metric_date', 'data_type': 'date'},
        cluster_by=['metric_date'],
        tags=['revenue', 'mrr', 'weekly_kpi']
    )
}}

/*
  revenue_daily_metrics — Phase 5
  Daily MRR, ARPU, NRR, churn MRR, expansion MRR.
  Grain: one row per metric_date.
  Source: stg_subscriptions (RevenueCat) + existing paid_customer / new_arr_daily_aggr_metrics models.
  Incremental: processes new dates only.
*/

with daily_subs as (
    -- Point-in-time snapshot of active subscriptions per day
    select
        snapshot_date                                   as metric_date,
        count(distinct case when is_active then user_id end) as active_subscribers,
        sum(case when is_active then mrr_usd else 0 end)     as mrr_usd
    from {{ ref('user_subscription_daily_snapshot_history') }}
    {% if is_incremental() %}
    where snapshot_date > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

new_mrr as (
    -- MRR from brand-new paying subscribers (first payment ever)
    select
        date(started_at)      as metric_date,
        sum(mrr_usd)          as new_mrr_usd,
        count(distinct user_id) as new_paying_users
    from {{ ref('stg_subscriptions') }}
    where is_first_subscription = true
      and is_active = true
    {% if is_incremental() %}
      and date(started_at) > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

churned_mrr as (
    -- MRR lost from cancellations on that day
    select
        date(cancelled_at)    as metric_date,
        sum(mrr_usd)          as churned_mrr_usd,
        count(distinct user_id) as churned_users
    from {{ ref('stg_subscriptions') }}
    where cancelled_at is not null
      and is_active = false
    {% if is_incremental() %}
      and date(cancelled_at) > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

expansion_mrr as (
    -- MRR gained from plan upgrades (monthly → annual, tier up)
    select
        date(upgraded_at)     as metric_date,
        sum(mrr_delta_usd)    as expansion_mrr_usd
    from {{ ref('stg_subscription_changes') }}
    where change_type = 'upgrade'
    {% if is_incremental() %}
      and date(upgraded_at) > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

contraction_mrr as (
    -- MRR lost from downgrades
    select
        date(downgraded_at)   as metric_date,
        abs(sum(mrr_delta_usd)) as contraction_mrr_usd
    from {{ ref('stg_subscription_changes') }}
    where change_type = 'downgrade'
    {% if is_incremental() %}
      and date(downgraded_at) > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

daily_active_free as (
    select
        date(created_at)          as metric_date,
        count(distinct user_id)   as free_users
    from {{ ref('stg_users') }}
    where plan_type = 'free'
    {% if is_incremental() %}
      and date(created_at) > (select max(metric_date) from {{ this }})
    {% endif %}
    group by 1
),

final as (
    select
        ds.metric_date,
        ds.active_subscribers,
        ds.mrr_usd,

        -- ARPU = MRR / active subscribers
        safe_divide(ds.mrr_usd, ds.active_subscribers)                  as arpu_usd,

        coalesce(nm.new_mrr_usd, 0)                                     as new_mrr_usd,
        coalesce(nm.new_paying_users, 0)                                as new_paying_users,

        coalesce(ch.churned_mrr_usd, 0)                                 as churned_mrr_usd,
        coalesce(ch.churned_users, 0)                                   as churned_users,

        coalesce(ex.expansion_mrr_usd, 0)                               as expansion_mrr_usd,
        coalesce(co.contraction_mrr_usd, 0)                             as contraction_mrr_usd,

        -- Net New MRR = new + expansion - churn - contraction
        coalesce(nm.new_mrr_usd, 0)
            + coalesce(ex.expansion_mrr_usd, 0)
            - coalesce(ch.churned_mrr_usd, 0)
            - coalesce(co.contraction_mrr_usd, 0)                       as net_new_mrr_usd,

        -- NRR (trailing 30d): (start_mrr + expansion - churn - contraction) / start_mrr
        -- Computed as rolling ratio; set null if start_mrr = 0
        safe_divide(
            ds.mrr_usd + coalesce(ex.expansion_mrr_usd, 0) - coalesce(ch.churned_mrr_usd, 0) - coalesce(co.contraction_mrr_usd, 0),
            lag(ds.mrr_usd, 30) over (order by ds.metric_date)
        )                                                                as nrr_trailing_30d,

        current_timestamp()                                              as updated_at
    from daily_subs ds
    left join new_mrr nm          on ds.metric_date = nm.metric_date
    left join churned_mrr ch      on ds.metric_date = ch.metric_date
    left join expansion_mrr ex    on ds.metric_date = ex.metric_date
    left join contraction_mrr co  on ds.metric_date = co.metric_date
)

select
    {{ dbt_utils.generate_surrogate_key(['metric_date']) }} as revenue_metric_id,
    *
from final
