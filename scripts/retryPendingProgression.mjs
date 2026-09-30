import { createClient } from "@supabase/supabase-js";

// Same operator contract as rating: dry-run unless --execute, exact host required.
const args = process.argv.slice(2);
const url = process.env.PROGRESSION_RETRY_SUPABASE_URL;
const key = process.env.PROGRESSION_RETRY_SERVICE_ROLE_KEY;
const host = args.find((arg) => arg.startsWith("--allow-host="))?.slice(13);
const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 20);
if (!url || !key || host !== new URL(url).hostname || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("Set progression retry server credentials and --allow-host=<exact hostname>; --limit must be 1..100.");
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from("progression_multiplayer_jobs").select("game_id")
  .is("applied_at", null).order("created_at").limit(limit);
if (error) throw new Error("Cannot read pending progression jobs");
const execute = args.includes("--execute");
console.log(`Pending progression: ${data.length}; mode: ${execute ? "execute" : "dry-run"}`);
for (const job of data) {
  if (!execute) { console.log(`pending ${job.game_id}`); continue; }
  const result = await db.rpc("apply_progression_multiplayer_game", { p_game_id: job.game_id });
  if (result.error) {
    console.error(`failed ${job.game_id}: ${result.error.code}`);
    process.exitCode = 1;
  } else console.log(`${result.data} ${job.game_id}`);
}
