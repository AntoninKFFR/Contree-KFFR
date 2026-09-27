import "server-only";
import { NextResponse } from "next/server";

export type TrainingDuoErrorCode =
  | "duo_session_not_found" | "duo_session_full" | "duo_session_expired"
  | "duo_not_member" | "duo_host_required" | "duo_wrong_status"
  | "duo_version_conflict" | "duo_already_answered" | "duo_waiting_for_partner"
  | "duo_already_ready" | "duo_partner_offline" | "duo_invalid_answer"
  | "duo_version_unsupported" | "duo_invalid_request";

const ERROR_DETAILS: Record<TrainingDuoErrorCode, { status: number; message: string }> = {
  duo_session_not_found: { status: 404, message: "Session introuvable ou inaccessible." },
  duo_session_full: { status: 409, message: "La session est complète." },
  duo_session_expired: { status: 410, message: "Cette session a expiré." },
  duo_not_member: { status: 404, message: "Session introuvable ou inaccessible." },
  duo_host_required: { status: 403, message: "Seul l'hôte peut faire cela." },
  duo_wrong_status: { status: 409, message: "Cette action n'est plus disponible." },
  duo_version_conflict: { status: 409, message: "La session vient de changer. Recharge puis réessaie." },
  duo_already_answered: { status: 409, message: "Réponse déjà enregistrée." },
  duo_waiting_for_partner: { status: 409, message: "En attente de ton partenaire." },
  duo_already_ready: { status: 409, message: "Tu es déjà prêt." },
  duo_partner_offline: { status: 409, message: "Ton partenaire doit être connecté pour démarrer." },
  duo_invalid_answer: { status: 400, message: "Réponse invalide." },
  duo_version_unsupported: { status: 409, message: "Cette version de la série n'est plus prise en charge." },
  duo_invalid_request: { status: 400, message: "Requête invalide." },
};

export class TrainingDuoError extends Error {
  readonly status: number;
  constructor(readonly code: TrainingDuoErrorCode) {
    super(ERROR_DETAILS[code].message);
    this.status = ERROR_DETAILS[code].status;
    this.name = "TrainingDuoError";
  }
}

export function duoDatabaseError(error: { message?: string; code?: string }): never {
  const message = error.message;
  if (message && Object.hasOwn(ERROR_DETAILS, message)) throw new TrainingDuoError(message as TrainingDuoErrorCode);
  throw error;
}

export function duoApiFailure(error: unknown, route: string) {
  if (error instanceof TrainingDuoError) {
    return NextResponse.json({ code: error.code, error: error.message }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ code: "authentication_required", error: "Authentification requise." }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  console.error("[training-duo-api] request failed", { route, code: error && typeof error === "object" && "code" in error ? String(error.code) : "unknown" });
  return NextResponse.json({ code: "server_error", error: "Erreur serveur." }, {
    status: 500, headers: { "Cache-Control": "no-store" },
  });
}
