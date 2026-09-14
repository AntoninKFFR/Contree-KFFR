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

export function sanitizeApiErrorText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (/sb_secret_|authorization|api[_-]?key|password|access[_-]?token|service[_-]?(?:role[_-]?)?key|eyJ[A-Za-z0-9_-]{10,}\.|["'](?:hands|state|server_state)["']\s*:/i.test(value)) {
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
      code: sanitizeApiErrorText(databaseError.code),
      message: sanitizeApiErrorText(databaseError.message) ?? sanitizeApiErrorText(error instanceof Error ? error.message : "Unknown error"),
      details: sanitizeApiErrorText(databaseError.details),
      hint: sanitizeApiErrorText(databaseError.hint),
    });
  }

  const message = error instanceof MultiplayerError
    ? error.message
    : authenticationError
      ? "Authentication required."
      : "Erreur serveur.";
  return NextResponse.json({ error: message }, { status });
}
