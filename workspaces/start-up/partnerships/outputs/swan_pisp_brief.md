# Swan — PISP Infrastructure Contract Brief
## v0.1
**Date:** 2026-04-10  
**Prepared by:** Finary Partnerships  
**Status:** DRAFT — for internal alignment before sending

---

## 1. Why Swan

Swan is a licensed EMI (Electronic Money Institution) under ACPR/Banque de France, offering:
- **PISP (Payment Initiation Service Provider)** capabilities under PSD2/DSP2
- White-label consent flows with SCA (Strong Customer Authentication)
- Developer-friendly API, already used by French fintechs at scale
- EU coverage across FR, DE, ES, NL, IT and more

Alternative: **Bridge by Bankin'** — strong data aggregation, PISP capabilities, but less BaaS-native than Swan. Swan preferred for primary PISP; Bridge as fallback/supplementary.

---

## 2. Finary Agent Use Cases for PISP

| Use Case | Description | Frequency |
|----------|-------------|-----------|
| Idle cash sweep | Transfer idle cash from user's bank → MMF subscription | Weekly/monthly |
| Subscription cancellation | Initiate stop-payment or reversal instruction | On-demand |
| Rebalancing cash move | Transfer cash between accounts for portfolio rebalancing | Quarterly |
| Tax-loss harvesting | Fund new purchases after loss crystallization | As needed |

---

## 3. Key Technical Requirements

- **Recurring consent:** Finary needs "standing order" style PISP consent — user authorizes once, agent executes multiple times within defined parameters. Confirm Swan supports variable-amount recurring PISP.
- **SCA handling:** Swan handles SCA redirect/push notification — Finary must integrate consent UX into app.
- **Webhook notifications:** Payment status webhooks for confirmation, failure handling.
- **Sandbox:** Full sandbox environment for pre-launch testing.
- **Latency:** Target <2s for payment initiation confirmation.

---

## 4. Proposed Commercial Terms

| Volume Tier | Price per initiation |
|-------------|---------------------|
| 0 – 10,000/month | €0.25 |
| 10,001 – 100,000/month | €0.15 |
| 100,001+/month | €0.08 |

- Monthly platform fee: €500/month (waived above €2,000/month transaction fees)
- Implementation / onboarding fee: €0 (target — standard for strategic partners)

**Revenue sensitivity:** At 50,000 MAU doing 1 sweep/month = 50,000 initiations = ~€7,500/month. Negligible vs. Amundi trail. Main cost is operational.

---

## 5. Key Contract Terms to Negotiate

1. **Recurring PISP consent scope:** Must explicitly allow Finary Agent to initiate without per-transaction user confirmation (within pre-approved parameters)
2. **Liability model:** Failed initiation = whose liability? Finary wants clear cap and Swan indemnification for platform-side failures
3. **SLA:** 99.9% uptime for payment initiation endpoint; compensation for downtime
4. **Termination:** 90-day notice; continuity of in-flight consent mandates post-termination
5. **Data:** No secondary use of transaction data by Swan; GDPR DPA required
6. **Exclusivity:** Non-exclusive (Finary reserves right to add Bridge)

---

## 6. Regulatory Alignment

- Swan holds the PISP license — Finary operates as **technical service provider** routing through Swan's licensed infrastructure
- Key question for Legal: Does Finary need its own PISP registration or can it fully operate under Swan's license via a TPP (Third Party Provider) agency model?
- FIDA (EU Financial Data Access regulation, expected 2026): Monitor impact on write-access consent framework — Swan should confirm roadmap

---

## 7. Open Points

1. Confirm Swan supports **variable-amount recurring PISP** (not just fixed standing orders)
2. Clarify whether Finary needs its own AISP/PISP registration or operates fully under Swan's license
3. Agree on **liability cap** for erroneous autonomous initiations
4. Confirm cross-border coverage (users with non-FR bank accounts)

---

## 8. Next Steps

1. Email Swan BD for intro call + commercial deck + sandbox access request
2. Share use case brief with Swan technical team
3. Engage Legal (see CALL_AGENT below) on PISP licensing question
4. Target: framework agreement signed by April 30, 2026
