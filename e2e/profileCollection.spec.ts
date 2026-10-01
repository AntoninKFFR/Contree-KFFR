import { test, expect, type Page } from "@playwright/test";
import { cosmeticsFixture } from "../tests/helpers/profileCosmetics";
import type { CosmeticSlot, CosmeticKey } from "../lib/profileCosmetics";
async function fixture(page: Page, theme: "light" | "dark", level = 40) {
  const snapshot = cosmeticsFixture(level),
    user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "ui@example.test",
      created_at: "2026-10-01T00:00:00Z",
      app_metadata: {},
      user_metadata: { username: "UnPseudoTresLongPourLaCollectionKFFR" },
    };
  let username = user.user_metadata.username;
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.fixture`;
  await page.addInitScript(
    ({ user, token, theme }) => {
      localStorage.setItem(
        "coinche:player-preferences:v1",
        JSON.stringify({ version: 1, visual: { theme } }),
      );
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { user, token, theme },
  );
  const equip = (slot: CosmeticSlot, key: CosmeticKey | null) => {
    snapshot.equipped[slot] = key;
    for (const item of snapshot.items)
      if (item.slot === slot) item.equipped = item.key === key;
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/v1/user")) data = user;
    else if (path.endsWith("/get_my_progression"))
      data = { total_xp: (25 * (level - 1) * (level + 6)) / 2 };
    else if (path.endsWith("/get_my_unlocked_profile_cosmetics"))
      data = snapshot;
    else if (path.endsWith("/set_my_profile_cosmetic")) {
      const body = route.request().postDataJSON();
      equip(body.p_slot, body.p_cosmetic_key);
      data = null;
    } else if (path.endsWith("/get_my_permanent_missions"))
      data = [
        "first_game",
        "first_win",
        "first_solo",
        "first_multiplayer",
        "first_training",
      ].map((key) => ({
        key,
        rewardXp: 100,
        completed: false,
        completedAt: null,
      }));
    else if (path.endsWith("/get_my_weekly_missions"))
      data = {
        catalogVersion: 1,
        weekStart: "2026-09-28",
        serverNow: "2026-10-01T12:00:00Z",
        nextResetAt: "2026-10-04T22:00:00Z",
        missions: ["wins", "solo_games", "training_series"].map((key) => ({
          key,
          target: 3,
          progress: 0,
          rewardXp: 200,
          completed: false,
          completedAt: null,
        })),
      };
    else if (path.endsWith("/profiles")) {
      if (route.request().method() === "PATCH")
        username = route.request().postDataJSON().username;
      data =
        route.request().method() === "PATCH"
          ? { username }
          : [{ id: user.id, username }];
    } else if (path.endsWith("/get_my_rating_summary"))
      data = {
        rating: 1000,
        rated_games: 0,
        wins: 0,
        losses: 0,
        forfeits: 0,
        peak_rating: 1000,
        rank: null,
        position: null,
        placement_games: 0,
        is_ranked: false,
        pending_matches: 0,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.route("**/api/social**", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          friends: [],
          received: [],
          sent: [],
          invitations: [],
          counts: {
            friends: 0,
            received: 0,
            sent: 0,
            receivedPending: 0,
            sentPending: 0,
          },
        },
      }),
    }),
  );
  await page.route("**/api/training/duo/invitations", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"data":[]}',
    }),
  );
  return { snapshot, equip };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await page.locator(".coinche-global-header").boundingBox())?.height,
  ).toBe(56);
}
for (const theme of ["light", "dark"] as const) {
  test(`@progression-ui collection equip/profile/remove and all six frames ${theme}`, async ({
    page,
  }, info) => {
    const data = await fixture(page, theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: /UnPseudo/ })).toBeVisible();
    await expect(page.locator("#profile-username .profile-frame")).toHaveCount(
      0,
    );
    await page.goto("/progression");
    await expect(
      page
        .getByRole("list", { name: "Titres", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(10);
    await page
      .getByRole("button", { name: "Équiper Maître des enchères", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Retirer Maître des enchères",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Badges", exact: true }).click();
    await expect(
      page
        .getByRole("list", { name: "Badges", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(8);
    await page
      .getByRole("button", { name: "Équiper Couronne", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retirer Couronne", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${theme}-badges.png`),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Cadres", exact: true }).click();
    await expect(
      page
        .getByRole("list", { name: "Cadres", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(6);
    await page.screenshot({
      path: info.outputPath(`${theme}-frames.png`),
      fullPage: true,
    });
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const category of ["Titres", "Badges", "Cadres"]) {
        const tab = page.getByRole("tab", { name: category, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await noOverflow(page);
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: info.outputPath(`${theme}-collection-${category}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const frame of data.snapshot.items.filter((i) => i.slot === "frame")) {
      await page
        .getByRole("button", { name: `Équiper ${frame.name}`, exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: `Retirer ${frame.name}`,
          exact: true,
        }),
      ).toBeVisible();
      await page.goto("/profile");
      await expect(page.locator("#profile-username .profile-title")).toHaveText(
        "Maître des enchères",
      );
      await expect(
        page.locator("#profile-username .profile-frame"),
      ).toHaveCount(1);
      await expect(
        page.locator(".coinche-global-header .profile-title"),
      ).toHaveCount(0);
      await expect(
        page.locator(".coinche-account-link .profile-badge--mini"),
      ).toHaveCount(1);
      for (const width of [1440, 1120, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
        if (width >= 1120) {
          const nav = (await page
              .getByRole("navigation", { name: "Navigation principale" })
              .boundingBox())!,
            controls = (await page
              .locator(".coinche-global-header .col-start-3")
              .boundingBox())!;
          expect(nav.x + nav.width).toBeLessThanOrEqual(controls.x);
        }
        await page.screenshot({
          path: info.outputPath(`${theme}-${frame.visualVariant}-${width}.png`),
          fullPage: true,
        });
      }
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
      const menu = page.getByRole("navigation", { name: "Navigation mobile" });
      await expect(menu.getByRole("progressbar")).toBeVisible();
      await expect(menu.locator(".profile-title")).toHaveCount(0);
      await expect(menu.locator(".profile-badge--mini")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/progression");
      await page.getByRole("tab", { name: "Cadres", exact: true }).click();
    }
    await page.goto("/profile");
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Pseudo", exact: true })
      .fill("ArthurCollection");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ArthurCollection", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#profile-username .profile-title")).toHaveText(
      "Maître des enchères",
    );
    await expect(
      page.getByRole("button", { name: "Se déconnecter", exact: true }),
    ).toBeVisible();
    await page.goto("/progression");
    await page
      .getByRole("button", { name: "Retirer Maître des enchères", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Équiper Maître des enchères",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/profile");
    await expect(page.locator("#profile-username .profile-title")).toHaveCount(
      0,
    );
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const level of [1, 2, 5]) {
    test(`@progression-ui surprise level ${level} ${theme} mobile empty/discovered categories`, async ({
      page,
    }, info) => {
      const { snapshot } = await fixture(page, theme, level);
      const requests: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/rpc/"))
          requests.push(new URL(r.url()).pathname);
      });
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/progression");
        await expect(
          page.getByRole("tab", { name: "Titres", exact: true }),
        ).toBeVisible();
        for (const [slot, label] of [
          ["title", "Titres"],
          ["badge", "Badges"],
          ["frame", "Cadres"],
        ] as const) {
          await page.getByRole("tab", { name: label, exact: true }).click();
          const items = snapshot.items.filter((i) => i.slot === slot);
          await expect(
            page
              .getByRole("list", { name: label, exact: true })
              .getByRole("listitem"),
          ).toHaveCount(items.length);
          if (!items.length)
            await expect(
              page.getByText(
                `Continue de progresser pour découvrir de nouveaux ${label.toLowerCase()}.`,
                { exact: true },
              ),
            ).toBeVisible();
          await expect(
            page.getByText("Verrouillé", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText(
              /Niveau .* requis|[0-9]+ \/ 24 débloqués|Légende KFFR|Couronne|Prestige/,
            ),
          ).toHaveCount(0);
          await noOverflow(page);
          await page.screenshot({
            path: info.outputPath(`${theme}-${level}-${label}-${width}.png`),
            fullPage: true,
          });
        }
      }
      expect(requests).toContain(
        "/rest/v1/rpc/get_my_unlocked_profile_cosmetics",
      );
      expect(requests).not.toContain("/rest/v1/rpc/get_my_profile_cosmetics");
    });
  }
}
