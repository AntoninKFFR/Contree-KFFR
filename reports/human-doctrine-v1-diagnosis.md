# Human doctrine V1 bidding diagnosis

Date: 2026-09-09

This report is diagnostic only. `hybrid_legacy_v1` remains the official bot and no V2 is introduced.

## Method

- Card play is Monte Carlo V1 for every compared strategy.
- Every tournament duel uses paired deals and reverses the teams.
- Screening: 8 doctrine ablations, 12 games each, 3 seeds, 96 games total.
- Final: 4 selected ablations, 300 games each, 100 games on each of 3 seeds, 1,200 games total.
- Disagreement audit: 5,000 deals, 23,459 unique bidding states, alternating legacy and doctrine auction progressions.
- Diagnostic examples contain only the acting player's hand, public bids and public score.

## Disagreement audit

Legacy and current doctrine disagree on 3,406 / 23,459 states (14.52%). Categories overlap when a divergence has several causes.

| Category | Count | Share of divergences |
| --- | ---: | ---: |
| Different bid value | 1,929 | 56.64% |
| Doctrine 110 vs legacy 100 | 1,045 | 30.68% |
| Legacy pass / doctrine bid | 770 | 22.61% |
| Legacy bid / doctrine pass | 402 | 11.80% |
| Different trump | 400 | 11.74% |
| Opponent-contract penalty active | 883 | 25.92% |
| Game-score adjustment active | 1,149 | 33.73% |
| Partner-support adjustment active | 68 | 2.00% |
| Thirty-four structure | 221 | 6.49% |
| J+9+third structure | 427 | 12.54% |
| Long-trump structure | 1,260 | 36.99% |
| Dry-nine structure | 0 | 0% |
| Outside aces | 2,064 | 60.60% |
| Protected tens | 670 | 19.67% |
| Long outside suits | 1,628 | 47.80% |
| Voids | 1,092 | 32.06% |
| Vulnerable-to-cuts | 1,224 | 35.94% |

Decision changes relative to current doctrine:

| Ablation | Changed states | Rate |
| --- | ---: | ---: |
| Legacy thresholds 54/70/86, no 110 | 3,324 | 14.17% |
| No opponent penalty | 411 | 1.75% |
| No score-gap adjustment | 256 | 1.09% |
| No partner support | 43 | 0.18% |
| Structural rules only | 3,411 | 14.54% |
| Structure + outside controls | 3,560 | 15.18% |
| Full doctrine without 110 | 1,809 | 7.71% |

## Screening

All eight variants scored 6/12, so winrate was deliberately not used as strong evidence. Average differential provided the secondary ordering:

- current doctrine and the three context removals: +61.17;
- full doctrine without 110: +37.33;
- structure + outside controls: +20.67;
- doctrine evaluation with legacy thresholds: +8.50;
- structural rules only: +3.50.

This screening selected current doctrine, legacy thresholds, no 110, and no opponent penalty for the 300-game direct finals.

## Final direct results against hybrid_legacy_v1

| Variant | W / 300 | Winrate | Avg score | Avg diff | Pass | Contracts | Success | Avg contract |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No opponent penalty | 159 | 53.00% | 323.52 | +27.93 | 66.31% | 376 | 68.88% | 104.15 |
| Current doctrine | 157 | 52.33% | 320.01 | +18.03 | 67.43% | 359 | 69.08% | 103.82 |
| Full doctrine, no 110 | 155 | 51.67% | 317.84 | +12.19 | 70.24% | 327 | 70.34% | 99.97 |
| Doctrine evaluation, legacy thresholds | 149 | 49.67% | 309.63 | +1.81 | 69.04% | 375 | 66.40% | 100.00 |

Per-seed winrates:

| Variant | Seed 20260909 | Seed 20261909 | Seed 20262909 |
| --- | ---: | ---: | ---: |
| No opponent penalty | 52% | 53% | 54% |
| Current doctrine | 52% | 54% | 51% |
| Full doctrine, no 110 | 55% | 51% | 49% |
| Legacy thresholds | 47% | 52% | 50% |

Exact bidding and role metrics:

| Variant | 80 | 90 | 100 | 110+ | Trump change | Leaves contract | Attack pts | Defense pts | Defensive set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No opponent penalty | 49 | 109 | 244 | 157 | 34.70% | 46.51% | 160.81 | 111.91 | 33.94% |
| Current doctrine | 50 | 110 | 245 | 138 | 32.97% | 49.22% | 160.52 | 110.28 | 33.05% |
| Full doctrine, no 110 | 54 | 112 | 326 | 0 | 25.00% | 54.20% | 159.11 | 111.95 | 33.59% |
| Legacy thresholds | 34 | 73 | 375 | 0 | 22.41% | 46.96% | 149.76 | 110.63 | 33.13% |

## Component effects

- **Thresholds:** with 110 disabled in both variants, current 60/76/94 thresholds score 51.67%, versus 49.67% for legacy 54/70/86. The higher gates take fewer contracts (327 vs 375) but succeed more often (70.34% vs 66.40%). This is the clearest explanation for the higher contract quality.
- **110:** current doctrine scores 52.33%, versus 51.67% without 110. It raises average contract by 3.85 and average differential by 5.84, while contract success falls by 1.26 points. The effect is small and not independently conclusive.
- **Opponent penalty:** removing it scores 53.00%, versus 52.33% current. It changes only 1.75% of audited decisions, but those decisions are high leverage. The penalty should be treated as auction utility, never intrinsic hand strength.
- **Score gap:** changes 1.09% of decisions and produced no screening separation. Evidence is insufficient.
- **Partner support:** changes only 0.18% of decisions and produced no screening separation. Evidence is insufficient.
- **Structural rules:** structural-only and structure-plus-controls both tied 6/12. Adding outside controls improved screening differential (+20.67 vs +3.50), but the sample is too small for a winrate claim.
- **Dry nine:** it never described the best-trump evaluation in a legacy/doctrine divergence in this audit. Its rule is therefore not the source of the observed global gap.

The old 28/60 result is compatible with sampling noise. Current doctrine's 157/300 result has an approximate 95% interval that still includes 50%, so it is not promotion evidence.

## Readable counterfactual examples

### Threshold/value divergence

- Hand: K-hearts, 7-hearts, A-spades, 10-spades, A-diamonds, K-diamonds, 10-clubs, 7-clubs
- Public auction: P0 bids 80 diamonds
- Legacy: 100 diamonds
- Doctrine: 90 diamonds
- Trace: legacy 86; intrinsic 87; outside ace +3, protected ten +2, vulnerable-to-cuts -4.

### 110 extension

- Hand: J-hearts, 9-hearts, 10-hearts, 9-spades, 7-spades, A-diamonds, 7-diamonds, A-clubs
- Public auction: empty
- Legacy: 100 hearts
- Doctrine: 110 hearts
- Trace: legacy 120; intrinsic 129; J+9+third +3, outside aces +6, first seat +1.

### Opponent penalty and cut vulnerability

- Hand: 10-hearts, K-hearts, A-spades, 10-spades, Q-spades, 10-diamonds, 7-diamonds, 10-clubs
- Public auction: P1 bids 90 hearts
- Legacy: 100 spades
- Doctrine: pass
- Trace: legacy 101; intrinsic 93; vulnerable-to-cuts -8; opponent penalty -3; auction score 90.

### Thirty-four

- Hand: 8-hearts, 7-hearts, J-spades, 10-spades, 9-diamonds, 10-diamonds, J-clubs, 9-clubs
- Public auction: P2 bids 90 diamonds, P3 passes, P0 passes
- Legacy: 100 clubs
- Doctrine: pass
- Trace: legacy 94; 34 penalty -10; vulnerable-to-cuts -8; opponent penalty -3; auction score 73.

## Recommendation for a future V2

Do not create or promote V2 in this phase. For a later experiment:

1. keep intrinsic hand strength separate from the decision to overcall;
2. retain the current higher thresholds as the better-tested base;
3. replace the opponent-contract subtraction with an explicit overcall gate or expected-utility comparison;
4. keep 110 behind an ablation flag until a larger paired test proves its small apparent benefit;
5. retain structural and outside-control features, but run dedicated larger ablations before assigning causal credit;
6. leave score-gap and partner-support adjustments disabled initially unless targeted scenarios demonstrate value.

Promotion recommendation: **NO**.
