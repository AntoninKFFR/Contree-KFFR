// Provision disposable local identities in memory, then run the real HTTP/DB/UI
// integration. Never prints or stores credentials. Never accepts a remote URL.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !service || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Disposable loopback Supabase only");
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const env = { ...process.env, FINALIZATION_LOCAL: "1" };
if (process.argv.slice(2).includes("multiplayer.spec.ts")) env.FINALIZATION_WEB_ONLY = "1";
const suffix = randomUUID().slice(0, 8);
for (let player = 1; player <= 4; player++) {
  const username = `Final${player}${suffix}`, email = `final-${player}-${suffix}@example.test`, password = `Local-${randomUUID()}-test`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (error) throw new Error(`Local identity provisioning failed for test player ${player}`);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !data.session) throw new Error("Local test login failed");
  env[`E2E_USER_${player}_EMAIL`] = email; env[`E2E_USER_${player}_PASSWORD`] = password; env[`E2E_USER_${player}_USERNAME`] = username;
  env[`FINALIZATION_SESSION_${player}`] = JSON.stringify(data.session);
}
console.log("Four disposable loopback identities provisioned; credentials kept only in child environment.");
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.multiplayer-finalization.config.ts", ...process.argv.slice(2)], { env, stdio: "inherit" });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
