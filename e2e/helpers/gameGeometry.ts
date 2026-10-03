import type { Page } from "@playwright/test";

export async function gameGeometry(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const all = (selector: string) => [...document.querySelectorAll(selector)].map(box);
    const shell = document.querySelector('.coinche-game-shell');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: box(document.querySelector('.coinche-global-header')),
      shell: box(shell), contentHeight: shell ? getComputedStyle(shell).getPropertyValue('--content-height') : null,
      table: box(document.querySelector('.coinche-game-scene')),
      bidding: box(document.querySelector('.coinche-bidding-panel')),
      biddingControls: all('.coinche-bidding-panel button'),
      hand: box(document.querySelector('.coinche-scene-hand-cards')),
      cards: all('.coinche-scene-hand-card button'),
      players: all('.coinche-player-panel'), trick: box(document.querySelector('.coinche-trick-area')),
      safe: Object.fromEntries(['left', 'right', 'bottom', 'top'].map(edge => [edge, getComputedStyle(document.documentElement).getPropertyValue(`--safe-${edge}`)])),
      overflow: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight },
    };
  });
}
