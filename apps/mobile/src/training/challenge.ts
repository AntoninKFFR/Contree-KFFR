import { applyChallengeOutcome, challengeDifficulty, CHALLENGE_ADVANCE_MS, expireChallenge, generateChallengeExercise, initialChallengeState, nextChallengeQuestion, type ChallengeState, type TrickValueChallengeMode } from "@/engine/training/trickValueChallenge";
import { generatorVersion } from "@/engine/training/generator";
import { isTrickValueChallengeUnlocked, trainingChallengeRunSeed, type TrainingProgress } from "@/lib/training/progress";

/** Monotone time, including iOS suspension where performance.now may stop advancing. */
export function continuousClock(monotone = () => performance.now(), wall = () => Date.now()) {
  let previousMono = monotone(), previousWall = wall(), elapsed = 0;
  return () => { const m = monotone(), w = wall(); elapsed += Math.max(0, m - previousMono, w - previousWall); previousMono = m; previousWall = w; return elapsed; };
}
export class ChallengeRun {
  readonly seed: number; state: ChallengeState; deadline: number; transitionAt: number | null = null;
  message = "";
  exercise: ReturnType<typeof generateChallengeExercise>;
  constructor(readonly mode: TrickValueChallengeMode, progress: TrainingProgress, private now = continuousClock()) {
    if (!isTrickValueChallengeUnlocked(progress)) throw Error("Réussis 8/10 en Confirmé pour débloquer ce défi.");
    this.seed = trainingChallengeRunSeed(progress, mode); this.state = initialChallengeState(mode);
    this.exercise = this.generate(); this.deadline = now() + this.state.remainingMs;
  }
  private generate() { return generateChallengeExercise({ runSeed: this.seed, exerciseIndex: this.state.exerciseIndex, generatorVersion, difficulty: challengeDifficulty(this.mode, this.state.exerciseIndex, this.state.correctAnswers) }); }
  get receipt() { return `challenge:${this.mode}:${this.seed}`; }
  remaining() { return Math.max(0, this.deadline - this.now()); }
  submit(value: number | null) {
    if (this.state.finished || this.transitionAt !== null) return false;
    const now = this.now(), remaining = Math.max(0, this.deadline - now);
    if (this.mode === "blitz" && remaining === 0) { this.state = expireChallenge(this.state); return true; }
    const endedAt = remaining === 0 ? this.deadline : now;
    const outcome = remaining === 0 ? "timeout" : value === this.exercise.answer ? "correct" : "wrong";
    const result = applyChallengeOutcome(this.state, outcome, remaining);
    this.state = result.state;
    this.message = outcome === "correct" ? "Bonne réponse !" : `Réponse : ${this.exercise.answer} points${this.mode === "survival" ? " · Une vie perdue" : ` · ${Math.abs(result.timeChangeMs) / 1000} s de pénalité`}`;
    if (this.mode === "blitz") this.deadline = now + this.state.remainingMs;
    this.transitionAt = this.state.finished ? null : endedAt + CHALLENGE_ADVANCE_MS;
    return true;
  }
  tick() {
    if (this.state.finished) return;
    const now = this.now();
    if (this.mode === "blitz" && now >= this.deadline) { this.state = expireChallenge(this.state); this.transitionAt = null; return; }
    if (this.transitionAt !== null && now >= this.transitionAt) {
      if (this.mode === "survival") this.deadline = this.transitionAt + this.state.remainingMs;
      this.state = nextChallengeQuestion(this.state); this.exercise = this.generate(); this.transitionAt = null; this.message = "";
    }
    if (this.transitionAt === null && now >= this.deadline) this.submit(null);
  }
}
