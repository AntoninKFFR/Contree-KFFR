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
    "coinche-game-shell h-[var(--content-height)] min-h-0 overflow-x-hidden overflow-y-auto [--shell-padding-x:0.5rem] py-2 sm:[--shell-padding-x:0.75rem]",
    analysisDesktop
      ? "lg:h-auto lg:min-h-[var(--content-height)] lg:overflow-y-auto"
      : "lg:h-[var(--content-height)] lg:overflow-hidden",
    mobileLandscape ? "overflow-hidden [--shell-padding-x:0px] [--shell-padding-y:0px] py-0 sm:[--shell-padding-x:1rem]" : "",
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
