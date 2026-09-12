export function isSoloDesktopAnalysisLayout(
  botReviewEnabled: boolean,
  analysisModeEnabled: boolean,
  mobileLandscape: boolean,
): boolean {
  return botReviewEnabled && analysisModeEnabled && !mobileLandscape;
}

export function soloMainClassName(analysisDesktop: boolean, mobileLandscape: boolean): string {
  return [
    "min-h-[calc(100dvh-56px)] overflow-x-hidden overflow-y-auto bg-[#f4f1e8] px-3 py-2 text-stone-950 sm:px-4",
    analysisDesktop
      ? "lg:h-auto lg:min-h-[calc(100dvh-56px)] lg:overflow-y-auto"
      : "lg:h-[calc(100dvh-56px)] lg:overflow-hidden",
    mobileLandscape ? "overflow-hidden px-0 py-0 sm:px-4" : "",
  ].join(" ");
}

export function soloContentClassName(analysisDesktop: boolean): string {
  return `mx-auto flex max-w-7xl flex-col gap-2 ${analysisDesktop ? "h-auto min-h-full" : "h-full"}`;
}

export function soloGridClassName(
  analysisDesktop: boolean,
  mobileLandscape: boolean,
  rightPanelOpen: boolean,
): string {
  return [
    `grid min-h-0 gap-2 ${analysisDesktop ? "flex-none" : "flex-1"}`,
    mobileLandscape
      ? "grid-cols-[minmax(0,1fr)]"
      : rightPanelOpen
        ? "lg:grid-cols-[minmax(0,1fr)_310px]"
        : "lg:grid-cols-[minmax(0,1fr)]",
  ].join(" ");
}
