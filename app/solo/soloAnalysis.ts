export function isSoloDesktopAnalysisLayout(
  botReviewEnabled: boolean,
  analysisModeEnabled: boolean,
  mobileLandscape: boolean,
): boolean {
  return botReviewEnabled && analysisModeEnabled && !mobileLandscape;
}

export function shouldShowBotReviewAction(
  botReviewEnabled: boolean,
  developerModeEnabled: boolean,
  mobileLandscape: boolean,
  hasReview: boolean,
  focusMode: boolean,
): boolean {
  return botReviewEnabled && developerModeEnabled && !mobileLandscape && hasReview && !focusMode;
}

export function soloMainClassName(analysisDesktop: boolean, mobileLandscape: boolean): string {
  return [
    "coinche-game-shell h-[calc(100dvh-48px)] min-h-0 overflow-x-hidden overflow-y-auto px-2 py-2 sm:px-3",
    analysisDesktop
      ? "lg:h-auto lg:min-h-[calc(100dvh-48px)] lg:overflow-y-auto"
      : "lg:h-[calc(100dvh-48px)] lg:overflow-hidden",
    mobileLandscape ? "overflow-hidden px-0 py-0 sm:px-4" : "",
  ].join(" ");
}

export function soloContentClassName(analysisDesktop: boolean): string {
  return `mx-auto flex w-full max-w-none flex-col gap-2 ${analysisDesktop ? "h-auto min-h-full" : "h-full"}`;
}

export function soloGridClassName(
  analysisDesktop: boolean,
  mobileLandscape: boolean,
): string {
  return [
    `relative grid min-h-0 grid-cols-[minmax(0,1fr)] gap-2 ${analysisDesktop ? "flex-none" : "flex-1"}`,
    mobileLandscape ? "grid-cols-[minmax(0,1fr)]" : "",
  ].join(" ");
}
