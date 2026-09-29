import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ authenticatedUserId: vi.fn(async () => "jwt-actor") }));
vi.mock("@/lib/server/trainingDuoRateLimit", () => ({ enforceDuoRateLimit: vi.fn(async () => {}) }));
vi.mock("@/lib/server/trainingDuoInvitationsService", () => ({
  listDuoInvitations: vi.fn(async () => []),
  sendDuoInvitation: vi.fn(async () => ({ id: "invitation", status: "pending" })),
  resolveDuoInvitation: vi.fn(async () => ({ sessionId: "joined" })),
}));
import { sendDuoInvitation, resolveDuoInvitation } from "@/lib/server/trainingDuoInvitationsService";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";
import { enforceDuoRateLimit } from "@/lib/server/trainingDuoRateLimit";
import { TrainingDuoError } from "@/lib/server/trainingDuoError";
import { POST as send } from "@/app/api/training/duo/sessions/[sessionId]/invitations/route";
import { POST as join } from "@/app/api/training/duo/invitations/[invitationId]/join/route";
import { POST as decline } from "@/app/api/training/duo/invitations/[invitationId]/decline/route";
import { GET as list } from "@/app/api/training/duo/invitations/route";
const id = "a61e2320-39c4-4c98-9f98-37fb187f7a21";
const sessionContext = { params: Promise.resolve({ sessionId: id }) };
const invitationContext = { params: Promise.resolve({ invitationId: id }) };
const request = (body = {}) => new Request("http://localhost/api/training/duo", { method: "POST", headers: { Authorization: "Bearer jwt" }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
it("sends to a friend using the JWT actor and no-store", async () => {
  const response = await send(request({ inviteeId: id }), sessionContext);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(sendDuoInvitation).toHaveBeenCalledWith("jwt-actor", id, id);
});
it("returns the authoritative non-friend denial", async () => {
  vi.mocked(sendDuoInvitation).mockRejectedValueOnce(new TrainingDuoError("duo_not_friends"));
  expect((await send(request({ inviteeId: id }), sessionContext)).status).toBe(403);
});
it("joins by invitation, applies the join rate limit, and returns only the session ID", async () => {
  const response = await join(request(), invitationContext);
  expect(await response.json()).toEqual({ data: { sessionId: "joined" } });
  expect(resolveDuoInvitation).toHaveBeenCalledWith("jwt-actor", id, "join");
  expect(enforceDuoRateLimit).toHaveBeenCalledWith(expect.any(Request), "jwt-actor", "join");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("declines and lists only for the JWT identity", async () => {
  vi.mocked(resolveDuoInvitation).mockResolvedValueOnce({ status: "declined" });
  expect((await decline(request(), invitationContext)).status).toBe(200);
  expect(resolveDuoInvitation).toHaveBeenCalledWith("jwt-actor", id, "decline");
  expect((await list(request())).headers.get("Cache-Control")).toBe("no-store");
});
it("rejects anonymous requests and client-supplied actors before mutations", async () => {
  expect((await send(request({ inviteeId: id, actor: id }), sessionContext)).status).toBe(400);
  expect(sendDuoInvitation).not.toHaveBeenCalled();
  vi.mocked(authenticatedUserId).mockRejectedValueOnce(new Error("Authentication required."));
  expect((await join(request(), invitationContext)).status).toBe(401);
  expect(resolveDuoInvitation).not.toHaveBeenCalled();
});
