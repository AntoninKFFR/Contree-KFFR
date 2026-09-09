# Human doctrine V2 experiment and high-leverage audit

Date: 2026-09-09

`hybrid_legacy_v1` remains strictly unchanged and official. Both Human Doctrine V2 bidding engines remain experimental, and every comparison below uses Monte Carlo V1 card play.

## Design

V2 separates two concepts:

- `IntrinsicHandEvaluation` uses only the acting player's hand and a candidate trump: trump quality and quantity, trump control, V1 human structures, outside aces, protected tens, long suits, singletons, voids, and structural cut vulnerability. Its thresholds are 60 / 76 / 94 for contracts 80 / 90 / 100.
- `AuctionDecisionContext` contains only public auction state: current contract and team, public bids, legal next values, seat position, partner's public bid, and public score.

Opponent contract, public score and partner information never modify `intrinsicHandStrength`. V2 first derives its desired contract intrinsically, then bids only when that value is legal and strictly above the current contract. The two diagnostic variants differ only in whether intrinsic strength of at least 125 may produce 110.

## Method and screening

- Screening: 150 games per variant, 50 on each of three seeds.
- Final: 1,200 games for the selected V2, 400 on each seed.
- Every sample uses paired deals and side inversion.
- Seeds: 20260909, 20261909, 20262909.

Screening results against `hybrid_legacy_v1`:

| Experimental bidding | W / L | Winrate | Avg score | Avg diff | Pass | Contracts | Success | Avg contract |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Human Doctrine V1 | 74 / 76 | 49.33% | 301.64 | -5.07 | 68.30% | 170 | 68.24% | 103.59 |
| Human Doctrine V2, no 110 | 76 / 74 | 50.67% | 306.80 | +9.45 | 70.59% | 156 | 72.44% | 99.87 |
| Human Doctrine V2, 110 | 74 / 76 | 49.33% | 302.41 | -0.36 | 67.36% | 174 | 68.97% | 103.79 |

V2 without 110 was retained as the only V2 finalist. It had the best screening winrate, average differential, and contract success rate. The screening sample is directional only, not promotion evidence.

## Final 1,200-game result

| Strategy | W / L | Winrate | Approx. 95% CI | Avg score | Avg diff | Pass | Contracts | Success | Avg contract |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Human Doctrine V2, no 110 | 615 / 585 | 51.25% | 48.42–54.08% | 316.95 | +11.33 | 70.99% | 1,246 | 67.17% | 99.97 |
| `hybrid_legacy_v1` | 585 / 615 | 48.75% | 45.92–51.58% | 305.63 | -11.33 | 66.40% | 1,606 | 63.45% | 99.94 |

Per-seed V2 results:

| Seed | W / L | Winrate | Avg score | Avg diff |
| --- | ---: | ---: | ---: | ---: |
| 20260909 | 210 / 190 | 52.50% | 323.40 | +16.77 |
| 20261909 | 204 / 196 | 51.00% | 318.33 | +9.94 |
| 20262909 | 201 / 199 | 50.25% | 309.14 | +7.28 |

Detailed bidding and role metrics:

| Strategy | 80 | 90 | 100 | 110+ | Trump changes | Leaves contract | Attack pts | Defense pts | Defensive set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Human Doctrine V2, no 110 | 250 | 447 | 1,242 | 0 | 467 (24.08%) | 56.31% | 152.34 | 118.64 | 36.55% |
| `hybrid_legacy_v1` | 161 | 427 | 1,597 | 0 | 626 (28.65%) | 43.69% | 143.31 | 109.63 | 32.83% |

V2 takes 360 fewer contracts and succeeds 3.72 percentage points more often. Its +2.5-point observed winrate is not statistically convincing: the approximate interval includes 50% by a wide margin.

Promotion recommendation: **NO**. V2 remains experimental.

## High-leverage opponent-penalty decisions

The audit records every final-sample bidding state where Human Doctrine V1 changes its choice when only `opponentContractPenalty` is disabled. This produced 215 / 13,186 decisions (1.63%), close to the earlier 1.75% diagnostic rate.

| Classification comparing V1 with selected V2 | Count | Share |
| --- | ---: | ---: |
| V1 passes, V2 overcalls | 45 | 20.93% |
| Trump change | 0 | 0.00% |
| Amount change | 0 | 0.00% |
| Other, including both pass because V2 has no 110 | 170 | 79.07% |

Of the 215 audited decisions, the decision team ultimately took the contract 74 times: 44 contracts succeeded and 30 failed (59.46% success). Across all 215 states, mean round differential for the decision team was -12.14 points and its game winrate was 107 / 215 (49.77%). These are descriptive posterior outcomes, not causal estimates: paired runs can expose the same public decision state more than once, and later auction or play decisions also affect the outcome.

Representative cases:

1. V1 pass / V2 100 hearts. Own hand: J-hearts, 9-hearts, J-spades, Q-spades, 7-spades, 9-diamonds, 10-diamonds, A-clubs. Public auction: partner 80 diamonds, opponent 90 diamonds. Posterior outcome: V2's team took 100 hearts, failed it, and lost the round by 262 points.
2. V1 pass / V2 100 diamonds. Own hand: Q-hearts, 8-hearts, 7-hearts, 10-spades, 7-spades, J-diamonds, 9-diamonds, Q-diamonds. Public auction: opponent 90 clubs. Posterior outcome: V2's team took and made 100 diamonds, winning the round by 194 points.
3. V1 pass / V2 100 diamonds. Own hand: Q-hearts, 8-hearts, J-spades, 10-spades, 9-diamonds, A-diamonds, A-clubs, 7-clubs. Public auction: opponent 90 spades. Posterior outcome: V2's team took 100 diamonds, failed it, and lost the round by 262 points.
4. V1 pass / V2 100 clubs. Own hand: 10-hearts, K-hearts, 9-spades, K-spades, 7-spades, K-diamonds, J-clubs, A-clubs. Public auction: opponent 90 diamonds. Posterior outcome: V2's team took and made 100 clubs, winning the round by 216 points.

## Information boundary

The benchmark exports only the acting player's own hand plus public bids and public score as decision inputs. Opponent and partner hidden hands are neither read by V2 bidding nor exported in this report. Final contract, contract success, round differential and game winner are attached only after the simulated game completes for offline posterior analysis; they never feed a production decision.

## Reproduction

Use `npm run benchmark:human-doctrine-v2 -- --variant=v1|v2_no110|v2_110 --games=<even games per seed> --seeds=<comma-separated seeds>`. The harness fixes Monte Carlo V1 card play, pairs each deal, reverses the teams, reports per-seed results, and instruments the high-leverage V1 penalty counterfactual.
