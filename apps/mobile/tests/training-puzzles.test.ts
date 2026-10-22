import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue, isPuzzleAxis, levelCount, type PuzzleAxis } from "../src/training/catalogue";
import { PuzzleRun, preparePuzzles, recordPuzzle, type PuzzleAnswer } from "../src/training/puzzles";
import { emptyTrainingProgress, parseTrainingProgress } from "../../../lib/training/progress";
import { ChallengeRun, continuousClock } from "../src/training/challenge";
import { MEMORY_AXIS_IDS } from "../../../engine/training/memory";
import { generateTrickValueSeries } from "../../../engine/training/trickValue";
import { createTrainingApi, seriesSubmission, TrainingApiError } from "../src/training/api";
import { verifyTrainingSeriesSubmission } from "../../../engine/training/seriesVerification";
import { isPersistablePuzzleAxisId } from "../../../engine/training/seriesContract";
const axes: PuzzleAxis[] = ["trick-value", ...MEMORY_AXIS_IDS, "opponent-voids", "bidding", "bid-reading"];
test("catalogue has exactly the web modes and the actual lock conditions", () => {
  const sections = catalogue(emptyTrainingProgress());
  assert.deepEqual(sections.map((s) => s.title), ["01 — Calculer", "02 — Mémoriser", "03 — Déduire", "04 — Annoncer"]);
  assert.equal(sections.flatMap((s) => s.items).length, 17);
  assert.equal(sections[0].items.filter((i) => !i.unlocked).length, 3);
  assert.equal(isPuzzleAxis("unknown"), false);
  assert.throws(() => preparePuzzles("trick-value", 2, emptyTrainingProgress()), /verrouillé/);
});
test("every level uses deterministic shared generation, grading, progression and server verification", () => {
  let progress = emptyTrainingProgress();
  for (const axis of axes) for (let level = 1; level <= levelCount(axis); level++) {
    const first = preparePuzzles(axis, level, progress), second = preparePuzzles(axis, level, progress);
    assert.deepEqual(first, second, `${axis}:${level} seed parity`);
    const run = new PuzzleRun(axis, level, progress, () => 1234);
    while (!run.finished) {
      const p = run.puzzle;
      const answer: PuzzleAnswer = p.kind === "number" ? { kind: "number", value: p.data.answer } : p.kind === "cards" ? { kind: "cards", selectedIds: p.data.expectedIds, assignments: p.data.requiresPlayers ? p.data.expectedPlayers : {} } : p.kind === "voids" ? { kind: "voids", selectedCells: p.data.expectedCells, trumpCount: p.data.expectedTrumpCount } : p.kind === "bidding" ? { kind: "bidding", value: p.data.expected } : { kind: "reading", value: { selectedAssertionIds: p.data.assertionChoices.filter((id) => p.data.promise.guaranteed.includes(id)) } };
      assert.equal(run.submit(answer), true); assert.equal(run.submit(answer), false);
      assert.equal(run.next(), true); assert.equal(run.next(), false);
    }
    assert.equal(run.score, 10, `${axis}:${level}`);
    if (isPersistablePuzzleAxisId(axis)) {
      const submission = seriesSubmission({ axisId: axis, level, seed: run.seed, answers: run.answers as Parameters<typeof seriesSubmission>[0]["answers"], durationMs: 5000 });
      assert.equal(verifyTrainingSeriesSubmission(submission).score, 10);
    }
    progress = recordPuzzle(progress, axis, level, run.score);
    assert.deepEqual(parseTrainingProgress(JSON.stringify(progress)), progress);
  }
  assert.deepEqual(preparePuzzles("trick-value", 1, emptyTrainingProgress()).series.map((p) => p.data), generateTrickValueSeries({ seed: 480000, level: 1, generatorVersion: 1 }));
});
test("challenge monotone clocks include suspension; timeout and double validation preserve web rules", () => {
  let mono = 100, wall = 1000; const clock = continuousClock(() => mono, () => wall);
  assert.equal(clock(), 0); wall += 5000; assert.equal(clock(), 5000); wall -= 10000; mono += 100; assert.equal(clock(), 5100);
  const progress = emptyTrainingProgress(); progress.axes["trick-value"].levels[2].bestScore = 8;
  let now = 0; const run = new ChallengeRun("survival", progress, () => now);
  assert.equal(run.state.lives, 3); assert.equal(run.submit(run.exercise.answer), true); assert.equal(run.submit(run.exercise.answer), false);
  now = 190; run.tick(); assert.equal(run.state.exerciseIndex, 1);
  now = run.deadline; run.tick(); assert.equal(run.state.lives, 2);
  for (let i = 0; i < 2; i++) { now += 190; run.tick(); now = run.deadline; run.tick(); }
  assert.equal(run.state.finished, true); assert.equal(run.state.lives, 0);
  const blitz = new ChallengeRun("blitz", progress, () => now); now += 60000; blitz.tick(); assert.equal(blitz.state.finished, true);
});
test("official HTTP origin, JWT and raw answers; expired session, refusal and network failure", async () => {
  const who = { user: { id: "a" }, access_token: "token" }, signal = new AbortController().signal;
  let called = 0;
  const api = createTrainingApi(async (url, init) => { called++; assert.equal(url, "https://contree-kffr.vercel.app/api/training/series"); assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer token"); return new Response(JSON.stringify({ data: { saved: true } })); });
  await api(who, signal, "/api/training/series", { answers: [] });
  await assert.rejects(api({ ...who, expires_at: 1 }, signal, "/api/training/series", {}), (e) => e instanceof TrainingApiError && e.status === 401);
  assert.equal(called, 1);
  await assert.rejects(createTrainingApi(async () => new Response(JSON.stringify({ code: "invalid_series", error: "Refus" }), { status: 400 }))(who, signal, "/api/training/series", {}), /Refus/);
  await assert.rejects(createTrainingApi(async () => { throw Error("offline"); })(who, signal, "/api/training/series", {}), /Connexion interrompue/);
});
