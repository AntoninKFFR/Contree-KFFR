// Creates disposable, confirmed accounts against the local Supabase used by CI.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const output = process.env.GITHUB_ENV;
if (!url || !serviceKey || !output || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Training duo E2E provisioning requires disposable local Supabase and GITHUB_ENV.");
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
for (let player = 1; player <= 2; player += 1) {
  const email = `duo-e2e-${player}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `DuoE2E${player}${suffix}` },
  });
  if (error) throw new Error(`Could not provision player ${player}: ${error.message}`);
  // GitHub displays GITHUB_ENV variables in later step headers; mask before exporting.
  process.stdout.write(`::add-mask::${email}\n::add-mask::${password}\n`);
  appendFileSync(output, `E2E_USER_${player}_EMAIL=${email}\nE2E_USER_${player}_PASSWORD=${password}\n`);
}
console.log("Provisioned two disposable authenticated training duo E2E accounts.");
