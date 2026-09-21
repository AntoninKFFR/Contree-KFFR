import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const hostFlag = args.find((arg) => arg.startsWith("--allow-host="));
const limitFlag = args.find((arg) => arg.startsWith("--limit="));
const limit = limitFlag ? Number(limitFlag.slice("--limit=".length)) : 20;
const url = process.env.RATING_RETRY_SUPABASE_URL;
const serviceKey = process.env.RATING_RETRY_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Set RATING_RETRY_SUPABASE_URL and RATING_RETRY_SERVICE_ROLE_KEY on the operator machine.");
}
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("--limit must be an integer from 1 to 100.");
}
const hostname = new URL(url).hostname;
if (!hostFlag || hostFlag.slice("--allow-host=".length) !== hostname) {
  throw new Error("Pass --allow-host=<exact Supabase hostname> to identify the target database.");
}
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: pending, error } = await client
  .from("rating_matches")
  .select("source_game_id")
  .eq("status", "pending")
  .order("created_at", { ascending: true })
  .limit(limit);
if (error) throw new Error(`Cannot list pending ratings: ${error.message}`);
console.log(`Pending ratings selected: ${pending.length}. Mode: ${execute ? "execute" : "dry-run"}.`);
let applied = 0;
let failed = 0;
for (const row of pending) {
  if (!execute) {
    console.log(`pending ${row.source_game_id}`);
    continue;
  }
  const result = await client.rpc("apply_rating_match", { p_source_game_id: row.source_game_id });
  if (result.error) {
    failed += 1;
    console.error(`failed ${row.source_game_id}: ${result.error.message}`);
  } else {
    if (result.data === "applied") applied += 1;
    console.log(`${result.data} ${row.source_game_id}`);
  }
}
console.log(`Applied: ${applied}; failed: ${failed}.`);
if (failed) process.exitCode = 1;
