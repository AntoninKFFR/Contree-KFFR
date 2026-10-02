// Only a disposable local Supabase may be used for browser Rating mutations.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const output = process.env.GITHUB_ENV;
if (!url || !key || !output || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Multiplayer E2E provisioning requires disposable local Supabase and GITHUB_ENV.");
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
for (let player = 1; player <= 4; player++) {
  const email = `multi-e2e-${player}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  process.stdout.write(`::add-mask::${email}\n::add-mask::${password}\n`);
  // Existing multiplayer scenarios intentionally use these four public seat names.
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `E2E_P${player}` } });
  if (error) throw error;
  appendFileSync(output, `E2E_USER_${player}_EMAIL=${email}\nE2E_USER_${player}_PASSWORD=${password}\n`, { mode: 0o600 });
}
console.log("Provisioned four disposable local multiplayer E2E accounts.");
