import Link from "next/link";
import type { FriendProfile, FriendStats } from "@/lib/friendProfile";
import { ProfileIdentity } from "@/components/profile/ProfileCosmetics";
import { AppPage, AppSurface, appSecondaryActionClass, appPrimaryActionClass } from "@/components/ui/AppShell";
export type FriendProfileState = "loading" | "signed-out" | "unavailable" | "error" | "ready";
export function FriendProfileView({ profile, state, userId, online = false, pending = false, message, onRetry, onPlay, onTrain }: {
  profile: FriendProfile | null; state: FriendProfileState; userId: string; online?: boolean;
  pending?: boolean; message?: string | null; onRetry?: () => void; onPlay?: () => void; onTrain?: () => void;
}) {
  return <AppPage>
    <Link href="/friends" className="text-sm font-bold">← Retour aux amis</Link>
    {state !== "ready" || !profile ? <AppSurface>
      <h1 className="text-xl font-black">{state === "loading" ? "Chargement…" : state === "signed-out" ? "Connecte-toi pour voir le profil d’un ami." : state === "error" ? "Impossible de charger ce profil." : "Ce profil n’est pas disponible."}</h1>
      {state === "signed-out" ? <Link className={`${appPrimaryActionClass} mt-4`} href={`/login?next=${encodeURIComponent(`/friends/${userId}`)}`}>Se connecter</Link> : null}
      {state === "error" ? <button className={`${appSecondaryActionClass} mt-4`} onClick={onRetry}>Réessayer</button> : null}
    </AppSurface> : <>
      <AppSurface>
        <p className="coinche-ui-kicker mb-3 text-xs font-black uppercase">Profil ami</p>
        <ProfileIdentity name={<h1 className="min-w-0 break-words text-2xl font-black">{profile.username}</h1>} equipped={profile.equipped} />
        <p className="mt-3 font-bold">Niveau {profile.level}</p>
        <p className="coinche-ui-muted text-sm">{online ? "En ligne" : "Hors ligne"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={appPrimaryActionClass} disabled={pending} onClick={onPlay}>Jouer</button>
          <button className={appSecondaryActionClass} disabled={pending} onClick={onTrain}>S’entraîner</button>
        </div>
        {message ? <p className="coinche-notice mt-3" role="alert" data-tone="error">{message}</p> : null}
      </AppSurface>
      <div className="grid gap-5 sm:grid-cols-2"><Stats title="Solo" stats={profile.solo} /><Stats title="Multijoueur" stats={profile.multiplayer} /></div>
      {profile.rating ? <AppSurface><h2 className="text-lg font-black">Classement</h2><p className="mt-2">{profile.rating.rank} · {profile.rating.rating} points</p><p className="coinche-ui-muted text-sm">Position {profile.rating.position}</p></AppSurface> : null}
    </>}
  </AppPage>;
}
function Stats({ title, stats }: { title: string; stats: FriendStats }) {
  return <AppSurface><h2 className="text-lg font-black">{title}</h2><dl className="mt-4 grid grid-cols-2 gap-4">
    {([["Parties", stats.games], ["Victoires", stats.wins], ["Défaites", stats.losses], ["Taux de victoire", `${stats.winrate} %`]] as const).map(([name, value]) => <div key={name} className="min-w-0"><dt className="coinche-ui-muted text-sm">{name}</dt><dd className="text-xl font-black">{value}</dd></div>)}
  </dl></AppSurface>;
}
