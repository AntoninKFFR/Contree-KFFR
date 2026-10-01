// Disposable local Supabase + Next only; never production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { getProgression } from "../lib/progression/formulaV1";
import {
  getMyProfileCosmetics,
  setMyProfileCosmetic,
} from "../lib/profileCosmetics";
const url = process.env.PROGRESSION_TEST_SUPABASE_URL!,
  anon = process.env.PROGRESSION_TEST_SUPABASE_ANON_KEY!,
  service = process.env.PROGRESSION_TEST_SUPABASE_SERVICE_ROLE_KEY!,
  api = process.env.PROGRESSION_TEST_API_URL ?? "http://127.0.0.1:3000";
if (
  !url ||
  !anon ||
  !service ||
  ![url, api].every((u) =>
    ["localhost", "127.0.0.1", "::1"].includes(new URL(u).hostname),
  )
)
  throw new Error("Local disposable credentials required");
const options = { auth: { persistSession: false, autoRefreshToken: false } },
  admin = createClient(url, service, options),
  anonymous = createClient(url, anon, options);
const users: {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}[] = [];
function checked<
  T extends { data: unknown; error: { message: string } | null },
>(r: T): NonNullable<T["data"]> {
  if (r.error || r.data === null)
    throw new Error(r.error?.message ?? "missing data");
  return r.data as NonNullable<T["data"]>;
}
async function identity() {
  const email = `cosmetic-${randomUUID()}@example.test`,
    password = `Local-${randomUUID()}`;
  const { user } = checked(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: `Collection${users.length}${randomUUID().slice(0, 5)}`,
      },
    }),
  );
  assert.ok(user);
  const client = createClient(url, anon, options);
  checked(await client.auth.signInWithPassword({ email, password }));
  const who = { id: user.id, email, password, client };
  users.push(who);
  return who;
}
async function credit(
  who: (typeof users)[number],
  amount: number,
  source: string,
  id: string = randomUUID(),
) {
  return checked(
    await admin.rpc("credit_progression_xp", {
      p_user_id: who.id,
      p_amount: amount,
      p_source_type: source,
      p_source_id: id,
    }),
  );
}
const denied = async (r: PromiseLike<{ error: unknown }>) =>
  assert.ok((await r).error, "operation must be denied");
try {
  const [a, b] = await Promise.all([identity(), identity()]);
  const fresh = await getMyProfileCosmetics(a.client);
  assert.equal(fresh.items.length, 24);
  assert.ok(fresh.items.every((i) => !i.unlocked && !i.equipped));
  assert.equal(
    checked(
      await admin.from("player_progression").select("*").eq("user_id", a.id),
    ).length,
    0,
  );
  await denied(anonymous.rpc("get_my_profile_cosmetics"));
  await denied(admin.rpc("get_my_profile_cosmetics"));
  await denied(a.client.rpc("get_my_profile_cosmetics", { user_id: b.id }));
  await denied(
    a.client.rpc("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: "title_taker",
      user_id: b.id,
    }),
  );
  const exec = promisify(execFile);
  for (const level of new Set(fresh.items.map((i) => i.unlockLevel))) {
    const { stdout } = await exec("docker", [
      "exec",
      "supabase_db_contree-kffr",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `select private.progression_total_xp_for_level(${level})`,
    ]);
    const threshold = Number(stdout.trim());
    assert.equal(getProgression(threshold).level, level);
    assert.equal(getProgression(threshold - 1).level, level - 1);
    assert.equal(getProgression(threshold).levelStartXp, threshold);
  }
  await credit(a, 99, "solo_game");
  await Promise.all([
    credit(a, 1, "permanent_mission", "concurrent-A"),
    credit(a, 125, "weekly_mission", "concurrent-B"),
  ]);
  let snapshot = await getMyProfileCosmetics(a.client);
  assert.equal(snapshot.items.filter((i) => i.unlocked).length, 2);
  assert.equal(checked(await a.client.rpc("get_my_progression")).total_xp, 225);
  const historical = snapshot.items
    .filter((i) => i.unlocked)
    .map((i) => i.unlockedAt);
  await credit(a, 125, "weekly_mission", "concurrent-B");
  assert.deepEqual(
    (await getMyProfileCosmetics(a.client)).items
      .filter((i) => i.unlocked)
      .map((i) => i.unlockedAt),
    historical,
  );
  await credit(a, 22425 - 225, "multiplayer_game");
  snapshot = await getMyProfileCosmetics(a.client);
  assert.ok(snapshot.items.every((i) => i.unlocked));
  assert.deepEqual(snapshot.equipped, {
    title: null,
    badge: null,
    frame: null,
  });
  await setMyProfileCosmetic(a.client, "title", "title_taker");
  await setMyProfileCosmetic(a.client, "title", "title_auction_master");
  await setMyProfileCosmetic(a.client, "badge", "badge_coinche");
  await setMyProfileCosmetic(a.client, "frame", "frame_black_gold");
  assert.deepEqual((await getMyProfileCosmetics(a.client)).equipped, {
    title: "title_auction_master",
    badge: "badge_coinche",
    frame: "frame_black_gold",
  });
  await setMyProfileCosmetic(a.client, "title", null);
  assert.equal((await getMyProfileCosmetics(a.client)).equipped.title, null);
  await denied(
    b.client.rpc("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: "title_taker",
    }),
  );
  await denied(
    a.client.rpc("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: "badge_club",
    }),
  );
  await denied(
    a.client.rpc("set_my_profile_cosmetic", {
      p_slot: "unknown",
      p_cosmetic_key: null,
    }),
  );
  await denied(
    anonymous.rpc("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: null,
    }),
  );
  for (const table of [
    "profile_cosmetic_unlocks",
    "profile_cosmetic_equipment",
  ]) {
    assert.deepEqual(
      checked(await b.client.from(table).select("*").eq("user_id", a.id)),
      [],
    );
  }
  for (const client of [anonymous, a.client, admin])
    for (const [table, row] of [
      ["profile_cosmetic_catalog_versions", { version: 99 }],
      [
        "profile_cosmetics",
        {
          key: "forged",
          introduced_version: 1,
          slot: "title",
          display_name: "Fake",
          visual_variant: "standard",
          unlock_type: "level",
          unlock_level: 1,
          sort_order: 99,
        },
      ],
      [
        "profile_cosmetic_unlocks",
        {
          user_id: b.id,
          cosmetic_key: "title_taker",
          unlock_type: "level",
          unlock_level: 2,
          total_xp_at_unlock: 999,
        },
      ],
      [
        "profile_cosmetic_equipment",
        { user_id: b.id, slot: "title", cosmetic_key: "title_taker" },
      ],
    ] as const) {
      await denied(client.from(table).insert(row));
      await denied(
        client
          .from(table)
          .update(row)
          .eq(Object.keys(row)[0], Object.values(row)[0]),
      );
      await denied(
        client
          .from(table)
          .delete()
          .eq(Object.keys(row)[0], Object.values(row)[0]),
      );
    }
  await credit(b, 6175, "solo_game");
  const level20 = await getMyProfileCosmetics(b.client);
  assert.equal(level20.items.length, 24);
  assert.equal(level20.items.filter((i) => i.unlocked).length, 16);
  assert.ok(level20.items.every((i) => i.unlocked === i.unlockLevel <= 20));
  assert.deepEqual(level20.equipped, { title: null, badge: null, frame: null });
  await setMyProfileCosmetic(b.client, "title", "title_contree_ace");
  assert.equal(
    (await getMyProfileCosmetics(b.client)).equipped.title,
    "title_contree_ace",
  );
  await denied(
    b.client.rpc("set_my_profile_cosmetic", {
      p_slot: "frame",
      p_cosmetic_key: "frame_kffr_signature",
    }),
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${api}/login`);
    await page.getByLabel("Email").fill(a.email);
    await page.getByLabel("Mot de passe").fill(a.password);
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname !== "/login");
    await page.goto(`${api}/progression`);
    await page
      .getByRole("button", { name: "Équiper Maître des enchères", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retirer Maître des enchères", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Badges", exact: true }).click();
    await page
      .getByRole("button", { name: "Retirer Coinche", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Équiper Couronne", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retirer Couronne", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Cadres", exact: true }).click();
    await page
      .getByRole("button", { name: "Équiper KFFR Signature", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retirer KFFR Signature", exact: true })
      .waitFor();
    await page.goto(`${api}/profile`);
    await page
      .locator("#profile-username .profile-title")
      .filter({ hasText: "Maître des enchères" })
      .waitFor();
    assert.equal(
      await page.locator("#profile-username .profile-frame--signature").count(),
      1,
    );
    assert.equal(
      await page.locator(".coinche-account-link .profile-badge").count(),
      1,
    );
    assert.equal(
      await page.locator(".coinche-global-header .profile-title").count(),
      0,
    );
    await page.reload();
    await page.locator("#profile-username .profile-title").waitFor();
    await page.goto(`${api}/progression`);
    await page
      .getByRole("button", { name: "Retirer Maître des enchères", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Équiper Maître des enchères", exact: true })
      .waitFor();
    await page.goto(`${api}/profile`);
    await page.getByRole("button", { name: "Modifier", exact: true }).waitFor();
    assert.equal(
      await page.locator("#profile-username .profile-title").count(),
      0,
    );
    console.log(
      "Profile collection real authenticated E2E: equip/replace three slots, profile/navbar, reload persistence and removal passed (1 journey).",
    );
  } finally {
    await browser.close();
  }
  console.log(
    "Cosmetics SQL/TS thresholds, real JWT owner/RLS/grants, concurrent XP unlocks, stable retry timestamps and three-slot equipment passed.",
  );
} finally {
  for (const user of users) checked(await admin.auth.admin.deleteUser(user.id));
}
