/** Club Émeraude: one palette and scale for the game, account and native dialogs. */
export const tokens = {
  colors: {
    background: "#071B15", surface: "#112E25", raised: "#193C30", inset: "#0A211A",
    border: "#3E5E4B", hairline: "#294C3C", text: "#F7F0DF", muted: "#B5C9BA",
    accent: "#E2BF78", accentPressed: "#CEAA63", accentInk: "#201B10",
    danger: "#FFB6AD", paper: "#F4EBD8", cardInk: "#16382C", cardRed: "#962F40",
    scrim: "rgba(2,12,8,0.96)", shadow: "rgba(0,0,0,0.32)", clear: "transparent",
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 20, round: 999 },
  type: {
    display: { fontFamily: "Georgia", fontSize: 34, lineHeight: 38 },
    displayCompact: { fontFamily: "Georgia", fontSize: 27, lineHeight: 31 },
    heading: { fontFamily: "Georgia", fontSize: 21, lineHeight: 27, fontWeight: "600" as const },
    body: { fontSize: 14, lineHeight: 20 },
    caption: { fontSize: 12, lineHeight: 17 },
    label: { fontSize: 14, lineHeight: 20, fontWeight: "700" as const },
    eyebrow: { fontSize: 11, lineHeight: 16, letterSpacing: 2, fontWeight: "700" as const },
  },
  shadow: {
    panel: "0 6px 18px rgba(0,0,0,0.20)",
    card: "0 6px 10px rgba(0,0,0,0.30)",
    button: "0 3px 0 #8D6E38, 0 5px 9px rgba(0,0,0,0.24)",
  },
  motion: { pressDuration: 120, pressScale: 0.97, easing: "ease-out" },
} as const;
