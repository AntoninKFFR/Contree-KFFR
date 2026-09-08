import "server-only";
import { NextResponse } from "next/server";
import { MultiplayerError } from "./multiplayerGame";

type ErrorContext = {
  route: string;
  action: string;
};

type DatabaseError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (/sb_secret_|authorization|api[_-]?key|["'](?:hands|state|server_state)["']\s*:/i.test(value)) {
    return "[redacted]";
  }
  return value.slice(0, 2_000);
}

export function apiFailure(error: unknown, context: ErrorContext) {
  const authenticationError = error instanceof Error && error.message === "Authentication required.";
  const status = error instanceof MultiplayerError ? error.status : authenticationError ? 401 : 500;

  if (status >= 500) {
    const databaseError = error && typeof error === "object" ? error as DatabaseError : {};
    console.error("[multiplayer-api] request failed", {
      route: context.route,
      action: context.action,
      code: safeText(databaseError.code),
      message: safeText(databaseError.message) ?? (error instanceof Error ? error.message : "Unknown error"),
      details: safeText(databaseError.details),
      hint: safeText(databaseError.hint),
    });
  }

  const message = error instanceof MultiplayerError
    ? error.message
    : authenticationError
      ? "Authentication required."
      : "Erreur serveur.";
  return NextResponse.json({ error: message }, { status });
}
