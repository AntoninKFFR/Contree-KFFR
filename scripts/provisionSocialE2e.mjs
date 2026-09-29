// Disposable local Supabase only. Credentials are written to a private CI env file, never stdout.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SOCIAL_TEST_SUPABASE_URL;
const key = process.env.SOCIAL_TEST_SUPABASE_SERVICE_ROLE_KEY;
const output = process.env.GITHUB_ENV;
if (!url || !key || !output || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Social E2E provisioning requires disposable local Supabase and GITHUB_ENV.");
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
process.stdout.write(`::add-mask::${key}\n`);
const suffix = randomUUID().slice(0, 8);
for (let player = 1; player <= 2; player += 1) {
  const email = `social-e2e-${player}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const username = `SocialE2E${player}${suffix}`;
  process.stdout.write(`::add-mask::${email}\n::add-mask::${password}\n`);
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (error) throw error;
  appendFileSync(output, `E2E_USER_${player}_EMAIL=${email}\nE2E_USER_${player}_PASSWORD=${password}\n`, { mode: 0o600 });
}
console.log("Provisioned two disposable local Social E2E accounts.");
