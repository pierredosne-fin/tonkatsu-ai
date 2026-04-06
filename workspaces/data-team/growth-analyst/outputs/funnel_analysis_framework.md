# Funnel Analysis Framework — Finary
*Growth Analyst | 2026-04-06*

## North Star
**MPEU** — Monthly Portfolio-Engaged Users: ≥1 active connected account AND ≥2 logins in past 30 days.

---

## Funnel Stages

```
[Signup] → [First Connection] → [Second Login] → [Paid Conversion]
    S0           S1                    S2                 S3
```

### Stage Definitions

| Stage | Event | Window | dbt Source |
|-------|-------|--------|------------|
| S0 Signup | user created | D0 | `user_activation_daily_metrics` |
| S1 First Connection | ≥1 institution connected | D0–D7 | `user_portfolio_engagement_daily_metrics` |
| S2 Second Login | ≥2 sessions | D0–D7 | needs `login_events` (validate in postgres/track) |
| S3 Paid Conversion | subscription created | D0–D30, D0–D60 | `user_subscription_daily_snapshot_history` |
| MPEU Engaged | S1 + ≥2 logins in trailing 30d | rolling | `user_portfolio_engagement_daily_metrics` |

---

## Key Conversion Rates to Track (Weekly)

| Metric | Formula | Benchmark Target |
|--------|---------|-----------------|
| S0→S1 Activation Rate | first_connection_users / signups (D7) | >40% |
| S1→S2 Return Rate | second_login_users / first_connection_users (D7) | >60% |
| S2→MPEU Retention | mpeu_users / second_login_cohort (D30) | >50% |
| S0→S3 Paid D30 | paid_users / signups (D30) | track baseline |
| S0→S3 Paid D60 | paid_users / signups (D60) | track baseline |

---

## Drop-off Sizing (Priority Order)

Priority assessment based on typical fintech funnel benchmarks:

1. **S0→S1 (Signup → First Connection)**: Highest absolute drop-off. Onboarding friction, trust barriers. Fixing this moves all downstream metrics.
2. **S1→S2 (First Connection → Second Login)**: Value realization gap. Users connect but don't return. Notification/email trigger point.
3. **S2→S3 (Second Login → Paid)**: Paywall timing and offer relevance.

---

## Segmentation Dimensions

Run each funnel stage broken down by:
- **Acquisition channel**: organic, paid_social, referral, direct
- **Device**: ios, android, web
- **Onboarding path**: connect_first, browse_first (if A/B tested)
- **Institution type**: bank_only, investment, multi-asset (proxy for wealth segment)
- **Cohort week**: D0 signup week

---

## Data Dependencies & Blockers

| Need | Status | Owner |
|------|--------|-------|
| Login/session event table in postgres/track | ❓ Not validated | Analytics Engineer |
| `user_retention_cohort_metrics` (Phase 4) | 🔨 SQL written, pending deploy | Analytics Engineer |
| `revenue_daily_metrics` (Phase 5) | 🔨 SQL written, pending deploy | Analytics Engineer |
| Acquisition channel field on user | ❓ Unknown | Analytics Engineer |
| Onboarding path variant field | ❓ Unknown | Analytics Engineer |

---

## Immediate Actions

1. **Analytics Engineer**: Validate login event availability and deploy Phase 4 retention cohort model
2. **Growth Analyst**: Once Phase 4 live → run cohort analysis by channel × device for first drop-off sizing
3. **First experiment candidate**: Onboarding copy/CTA at S0→S1 (highest leverage stage)
