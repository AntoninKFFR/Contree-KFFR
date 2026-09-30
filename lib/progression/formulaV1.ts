export type ProgressionSummary = {
  level: number;
  totalXp: number;
  levelStartXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemaining: number;
  progressPercent: number;
};

// k = completed levels. Summing 100 + 25 * (N - 1) gives
// T(k) = 25 * k * (k + 7) / 2. BigInt keeps threshold comparisons exact
// even at Number.MAX_SAFE_INTEGER; the square root is only an estimate.
function threshold(k: number): bigint {
  const completed = BigInt(k);
  return BigInt(25) * completed * (completed + BigInt(7)) / BigInt(2);
}

export function getProgression(totalXp: number): ProgressionSummary {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) {
    throw new RangeError("Total XP must be a nonnegative safe integer");
  }
  const exactXp = BigInt(totalXp);
  let completed = Math.floor((Math.sqrt(49 + 8 * (totalXp / 25)) - 7) / 2);
  // Floating-point rounding can put the estimate on an adjacent level.
  // These bounded corrections keep the calculation O(1).
  if (threshold(completed) > exactXp) completed -= 1;
  if (threshold(completed + 1) <= exactXp) completed += 1;
  const levelStartXp = Number(threshold(completed));
  const xpIntoLevel = totalXp - levelStartXp;
  const xpForNextLevel = 100 + 25 * completed;
  return {
    level: completed + 1,
    totalXp,
    levelStartXp,
    xpIntoLevel,
    xpForNextLevel,
    xpRemaining: xpForNextLevel - xpIntoLevel,
    progressPercent: Math.min(100, Math.max(0, 100 * xpIntoLevel / xpForNextLevel)),
  };
}
