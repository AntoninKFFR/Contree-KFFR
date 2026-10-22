import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { Button, styles } from "@/components/ui";
import { parseTrainingDuoInvitations, parseDuoInvitationJoined, parseDuoInvitationSent, parseDuoInvitationDeclined, type TrainingDuoInvitation } from "@/lib/trainingDuoInvitationsApi";
import { createTrainingApi } from "./api";
import { uuidPattern } from "@/solo/contract";
/** Existing invitations only: no push registration and no new notification channel. */
export function DuoInvitations({ sessionId, onJoined }: { sessionId?: string; onJoined: (id: string) => void }) {
  const { session } = useAccount();
  const [invitations, setInvitations] = useState<TrainingDuoInvitation[]>([]), [friends, setFriends] = useState<{ userId: string; username: string }[]>([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [epoch, reload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    if (session) void createTrainingApi()(session, abort.signal, "/api/training/duo/invitations").then((v) => { if (!abort.signal.aborted) setInvitations(parseTrainingDuoInvitations(v)); }).catch(() => { if (!abort.signal.aborted) setNotice("Invitations indisponibles pour le moment."); });
    if (session && sessionId) void createTrainingApi()<{ friends: { userId: string; username: string }[] }>(session, abort.signal, "/api/social").then((value) => {
      if (!Array.isArray(value.friends) || value.friends.some((f) => !uuidPattern.test(f.userId) || typeof f.username !== "string")) throw Error("Réponse amis invalide.");
      if (!abort.signal.aborted) setFriends(value.friends);
    }).catch(() => { if (!abort.signal.aborted) setNotice("Liste d’amis indisponible pour le moment."); });
    return () => abort.abort();
  }, [session, epoch, sessionId]);
  const [operation] = useState(() => new AbortController());
  useEffect(() => () => operation.abort(), [operation]);
  async function act(path: string, kind: "join" | "decline" | "invite", body = {}) {
    if (!session || busy) return; setBusy(true);
    try {
      const value = await createTrainingApi()(session, operation.signal, path, body);
      if (operation.signal.aborted) return;
      if (kind === "join") onJoined(parseDuoInvitationJoined(value).sessionId);
      else if (kind === "invite") { parseDuoInvitationSent(value); setNotice("Invitation envoyée."); }
      else { parseDuoInvitationDeclined(value); reload((n) => n + 1); }
    } catch (e) { if (!operation.signal.aborted) setNotice((e as Error).message); }
    finally { if (!operation.signal.aborted) setBusy(false); }
  }
  return <View style={{ gap: 8 }}><Text accessibilityRole="header" style={styles.heading}>Invitations Duo</Text>{notice ? <Text style={styles.body}>{notice}</Text> : null}{invitations.map((i) => <View key={i.id}><Text style={styles.body}>{i.username} · Niveau {i.level}</Text><Button label="Accepter l’invitation Duo" disabled={busy} onPress={() => { void act(`/api/training/duo/invitations/${encodeURIComponent(i.id)}/join`, "join"); }} /><Button label="Décliner" secondary disabled={busy} onPress={() => { void act(`/api/training/duo/invitations/${encodeURIComponent(i.id)}/decline`, "decline"); }} /></View>)}{sessionId ? <>{friends.length ? friends.map((friend) => <Button key={friend.userId} label={`Inviter ${friend.username}`} secondary disabled={busy} onPress={() => { void act(`/api/training/duo/sessions/${encodeURIComponent(sessionId)}/invitations`, "invite", { inviteeId: friend.userId }); }} />) : <Text style={styles.body}>Aucun ami à inviter pour le moment. Partage le code de session.</Text>}</> : <Button label="Actualiser les invitations" secondary disabled={busy} onPress={() => reload((n) => n + 1)} />}</View>;
}
