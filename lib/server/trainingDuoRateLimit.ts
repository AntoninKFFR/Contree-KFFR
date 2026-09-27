import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { TrainingDuoError } from "./trainingDuoError";
import { getSupabaseAdmin } from "./supabaseAdmin";

export const DUO_RATE_LIMITS = {
  create: { account: 10, ip: 30 },
  join: { account: 12, ip: 30 },
  mutation: { account: 120, ip: 240 },
  presence: { account: 60, ip: 180 },
} as const;
export const DUO_RATE_WINDOW_SECONDS = 60;
export type DuoRateScope = keyof typeof DUO_RATE_LIMITS;

type RateLimitArgs = {
  p_scope: DuoRateScope;
  p_account_hash: string;
  p_ip_hash: string;
  p_account_limit: number;
  p_ip_limit: number;
  p_window_seconds: number;
};
type Dependencies = {
  secret?: string;
  isVercel?: boolean;
  consume?: (args: RateLimitArgs) => Promise<number>;
};

function digest(secret: string, kind: "account" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`training-duo-v1:${kind}:${value}`).digest("hex");
}

export function duoRateLimitKeys(request: Request, userId: string, secret: string, isVercel: boolean) {
  // Vercel overwrites these forwarding headers. Outside Vercel, unverified
  // forwarding headers are ignored and all traffic shares a conservative bucket.
  const forwarded = isVercel
    ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for")
    : null;
  const candidate = forwarded?.split(",", 1)[0]?.trim() ?? "";
  const ip = isIP(candidate) ? candidate : "unverified";
  return { accountHash: digest(secret, "account", userId), ipHash: digest(secret, "ip", ip) };
}

async function consumeInDatabase(args: RateLimitArgs): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_consume_rate_limit", args);
  if (error) throw error;
  if (!Number.isInteger(data) || data < 0 || data > 3600) throw new Error("Invalid duo rate limit result.");
  return data;
}

export async function enforceDuoRateLimit(
  request: Request, userId: string, scope: DuoRateScope, dependencies: Dependencies = {},
): Promise<void> {
  const secret = dependencies.secret ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server credentials are not configured.");
  const { accountHash, ipHash } = duoRateLimitKeys(request, userId, secret,
    dependencies.isVercel ?? Boolean(process.env.VERCEL));
  const limits = DUO_RATE_LIMITS[scope];
  const retryAfter = await (dependencies.consume ?? consumeInDatabase)({
    p_scope: scope,
    p_account_hash: accountHash,
    p_ip_hash: ipHash,
    p_account_limit: limits.account,
    p_ip_limit: limits.ip,
    p_window_seconds: DUO_RATE_WINDOW_SECONDS,
  });
  if (retryAfter > 0) throw new TrainingDuoError("duo_rate_limited", retryAfter);
}
