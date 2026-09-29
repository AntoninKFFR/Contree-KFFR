import type { BidReadingLevel } from "@/engine/training/bidReading";
import { TrainingDuoApiError, type DuoToken } from "@/lib/trainingDuoApi";

export type TrainingDuoInvitation = {
  id: string; username: string; level: BidReadingLevel; status: "pending";
  createdAt: string; expiresAt: string;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Duo invitation response.");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error("Invalid Duo invitation response.");
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid Duo invitation response.");
  return value;
}
export function parseTrainingDuoInvitations(value: unknown): TrainingDuoInvitation[] {
  if (!Array.isArray(value)) throw new Error("Invalid Duo invitation response.");
  return value.map((entry) => {
    const row = record(entry);
    exact(row, ["id", "username", "level", "status", "createdAt", "expiresAt"]);
    if (row.status !== "pending" || ![1, 2, 3, 4].includes(Number(row.level)) || typeof row.level !== "number") throw new Error("Invalid Duo invitation response.");
    const createdAt = string(row.createdAt), expiresAt = string(row.expiresAt);
    if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(expiresAt))) throw new Error("Invalid Duo invitation response.");
    return { id: string(row.id), username: string(row.username), level: row.level as BidReadingLevel, status: "pending", createdAt, expiresAt };
  });
}
export function parseDuoInvitationSent(value: unknown): { id: string; status: "pending" | "already_invited" } {
  const row = record(value); exact(row, ["id", "status"]);
  if (row.status !== "pending" && row.status !== "already_invited") throw new Error("Invalid Duo invitation response.");
  return { id: string(row.id), status: row.status };
}
export function parseDuoInvitationJoined(value: unknown): { sessionId: string } {
  const row = record(value); exact(row, ["sessionId"]);
  return { sessionId: string(row.sessionId) };
}
export function parseDuoInvitationDeclined(value: unknown): { status: "declined" } {
  const row = record(value); exact(row, ["status"]);
  if (row.status !== "declined") throw new Error("Invalid Duo invitation response.");
  return { status: "declined" };
}
async function request<T>(url: string, token: DuoToken, parse: (value: unknown) => T, body?: object) {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}` },
    body: body ? JSON.stringify(body) : undefined });
  let payload: { data?: unknown; error?: string; code?: string } = {};
  try { payload = await response.json(); } catch { /* Preserve HTTP status. */ }
  if (!response.ok) throw new TrainingDuoApiError(payload.error ?? "Invitation impossible. Réessaie.", response.status, payload.code ?? "duo_invitation_error");
  return parse(payload.data);
}
const base = "/api/training/duo/invitations";
export const fetchTrainingDuoInvitations = (token: DuoToken) => request(base, token, parseTrainingDuoInvitations);
export const sendTrainingDuoInvitation = (sessionId: string, inviteeId: string, token: DuoToken) => request(
  `/api/training/duo/sessions/${encodeURIComponent(sessionId)}/invitations`, token, parseDuoInvitationSent, { inviteeId });
export const joinTrainingDuoInvitation = (id: string, token: DuoToken) => request(`${base}/${encodeURIComponent(id)}/join`, token, parseDuoInvitationJoined, {});
export const declineTrainingDuoInvitation = (id: string, token: DuoToken) => request(`${base}/${encodeURIComponent(id)}/decline`, token, parseDuoInvitationDeclined, {});
