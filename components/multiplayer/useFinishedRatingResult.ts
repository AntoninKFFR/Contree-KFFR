"use client";

import { useEffect, useState } from "react";
import { getMyRatingMatchResult, type RatingMatchResult } from "@/lib/rating/queries";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type FinishedRatingState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unrated" }
  | { kind: "error" }
  | { kind: "match"; result: RatingMatchResult };

const MAX_READS = 6;
const PENDING_RETRY_MS = 2_500;

export function shouldRetryFinishedRating(result: RatingMatchResult | null, reads: number): boolean {
  return result?.status === "pending" && reads < MAX_READS;
}

export function useFinishedRatingResult(sourceGameId: string | null, accessToken: string | null): FinishedRatingState {
  const [current, setCurrent] = useState<{ gameId: string | null; accessToken: string | null; state: FinishedRatingState }>({
    gameId: null, accessToken: null, state: { kind: "hidden" },
  });

  useEffect(() => {
    if (!sourceGameId || !accessToken) return;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let reads = 0;
    const client = getSupabaseClient();
    setCurrent({ gameId: sourceGameId, accessToken, state: { kind: "loading" } });

    async function read() {
      if (!client) {
        if (active) setCurrent({ gameId: sourceGameId!, accessToken, state: { kind: "error" } });
        return;
      }
      reads += 1;
      try {
        const result = await getMyRatingMatchResult(client, sourceGameId!);
        if (!active) return;
        setCurrent({ gameId: sourceGameId!, accessToken, state: result ? { kind: "match", result } : { kind: "unrated" } });
        if (shouldRetryFinishedRating(result, reads)) timeoutId = setTimeout(read, PENDING_RETRY_MS);
      } catch {
        if (active) setCurrent({ gameId: sourceGameId!, accessToken, state: { kind: "error" } });
      }
    }

    void read();
    return () => {
      active = false;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [accessToken, sourceGameId]);

  if (!sourceGameId || !accessToken) return { kind: "hidden" };
  return current.gameId === sourceGameId && current.accessToken === accessToken
    ? current.state : { kind: "loading" };
}
