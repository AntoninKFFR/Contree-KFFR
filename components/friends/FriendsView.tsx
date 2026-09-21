import Link from "next/link";
import type { SocialSearchResult, SocialSnapshot } from "@/lib/socialApi";
import {
  AppEyebrow,
  AppPage,
  AppSurface,
  appDangerActionClass,
  appInputClass,
  appPrimaryActionClass,
  appSecondaryActionClass,
} from "@/components/ui/AppShell";

export type FriendsPageState = "loading" | "unavailable" | "signed-out" | "username-required" | "error" | "ready";

type FriendsViewProps = {
  state: FriendsPageState;
  snapshot: SocialSnapshot | null;
  pageError?: string | null;
  actionMessage?: string | null;
  query: string;
  searchResults: SocialSearchResult[];
  searchState: "idle" | "loading" | "ready" | "error";
  searchError?: string | null;
  pendingAction?: string | null;
  onRetry?: () => void;
  onQueryChange?: (value: string) => void;
  onSend?: (userId: string) => void;
  onAccept?: (requestId: string) => void;
  onDecline?: (requestId: string) => void;
  onCancel?: (requestId: string) => void;
  onRemove?: (userId: string, username: string) => void;
  onAnswerRequest?: (requestId: string) => void;
};

export function FriendsView(props: FriendsViewProps) {
  const { state } = props;
  if (state !== "ready") {
    const content = state === "loading"
      ? { title: "Chargement…", body: "Nous préparons ton espace amis." }
      : state === "signed-out"
        ? { title: "Non connecté", body: "Connecte-toi pour retrouver tes amis et tes demandes." }
        : state === "username-required"
          ? { title: "Choisis d’abord ton pseudo", body: "Ton pseudo est nécessaire pour être trouvé et ajouter des amis." }
          : state === "unavailable"
            ? { title: "Service indisponible", body: "Vérifie la configuration Supabase puis recharge la page." }
            : { title: "Impossible de charger tes amis", body: props.pageError ?? "Réessaie dans un instant." };
    return (
      <AppPage width="narrow">
        <AppSurface className="p-6 sm:p-7">
          <AppEyebrow>Espace social</AppEyebrow>
          <h1 className="mt-2 text-2xl font-black text-[var(--text-primary)]">{content.title}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{content.body}</p>
          {state === "signed-out" ? <Link className={`${appPrimaryActionClass} mt-5`} href="/login?next=%2Ffriends">Se connecter</Link> : null}
          {state === "username-required" ? <Link className={`${appPrimaryActionClass} mt-5`} href="/profile">Choisir mon pseudo</Link> : null}
          {state === "error" && props.onRetry ? <button className={`${appPrimaryActionClass} mt-5`} onClick={props.onRetry} type="button">Réessayer</button> : null}
        </AppSurface>
      </AppPage>
    );
  }

  const snapshot = props.snapshot;
  if (!snapshot) return null;
  const friendIds = new Set(snapshot.friends.map((friend) => friend.userId));
  const sentByUser = new Map(snapshot.sent.map((request) => [request.userId, request]));
  const receivedByUser = new Map(snapshot.received.map((request) => [request.userId, request]));

  return (
    <AppPage width="wide">
      <AppSurface className="p-6 sm:p-7">
        <AppEyebrow>Espace social</AppEyebrow>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-primary)]">Amis</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
          Retrouve tes partenaires, réponds à tes demandes et cherche un joueur par son pseudo.
        </p>
        {props.actionMessage ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-[var(--text-primary)]" role="status">{props.actionMessage}</p> : null}
      </AppSurface>

      <div className="grid gap-4 lg:grid-cols-2">
        <SocialSection count={snapshot.counts.friends} title="Mes amis">
          {snapshot.friends.length === 0 ? <EmptyText>Tu n&apos;as pas encore d&apos;amis ajoutés.</EmptyText> : (
            <ul className="space-y-2">
              {snapshot.friends.map((friend) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3" key={friend.userId}>
                  <PlayerName username={friend.username} />
                  <button
                    className={appDangerActionClass}
                    disabled={props.pendingAction === `friend:${friend.userId}`}
                    onClick={() => props.onRemove?.(friend.userId, friend.username)}
                    type="button"
                  >
                    {props.pendingAction === `friend:${friend.userId}` ? "Suppression…" : "Supprimer"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SocialSection>

        <SocialSection count={snapshot.counts.received} title="Demandes reçues">
          {snapshot.received.length === 0 ? <EmptyText>Aucune demande reçue.</EmptyText> : (
            <ul className="space-y-2">
              {snapshot.received.map((request) => {
                const pending = props.pendingAction === `request:${request.id}`;
                return (
                  <li className="rounded-xl border border-white/10 bg-white/[0.035] p-3" id={`friend-request-${request.id}`} key={request.id} tabIndex={-1}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <PlayerName username={request.username} />
                      <div className="flex flex-wrap gap-2">
                        <button className={appPrimaryActionClass} disabled={pending} onClick={() => props.onAccept?.(request.id)} type="button">{pending ? "En cours…" : "Accepter"}</button>
                        <button className={appSecondaryActionClass} disabled={pending} onClick={() => props.onDecline?.(request.id)} type="button">Refuser</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SocialSection>

        <SocialSection count={snapshot.counts.sent} title="Demandes envoyées">
          {snapshot.sent.length === 0 ? <EmptyText>Aucune demande en attente.</EmptyText> : (
            <ul className="space-y-2">
              {snapshot.sent.map((request) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3" key={request.id}>
                  <PlayerName username={request.username} />
                  <button className={appSecondaryActionClass} disabled={props.pendingAction === `request:${request.id}`} onClick={() => props.onCancel?.(request.id)} type="button">
                    {props.pendingAction === `request:${request.id}` ? "Annulation…" : "Annuler"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SocialSection>

        <SocialSection title="Rechercher un joueur">
          <label className="block text-sm font-bold text-[var(--text-primary)]" htmlFor="friend-search">Pseudo</label>
          <input
            autoComplete="off"
            className={`${appInputClass} mt-2`}
            id="friend-search"
            maxLength={40}
            onChange={(event) => props.onQueryChange?.(event.target.value)}
            placeholder="Au moins 3 caractères"
            value={props.query}
          />
          <SearchResults
            friendIds={friendIds}
            onAnswerRequest={props.onAnswerRequest}
            onSend={props.onSend}
            pendingAction={props.pendingAction}
            query={props.query}
            receivedByUser={receivedByUser}
            results={props.searchResults}
            searchError={props.searchError}
            searchState={props.searchState}
            sentByUser={sentByUser}
          />
        </SocialSection>
      </div>
    </AppPage>
  );
}

function SocialSection({ children, count, title }: { children: React.ReactNode; count?: number; title: string }) {
  return (
    <AppSurface className="h-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[var(--text-primary)]">{title}</h2>
        {count !== undefined ? <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-black text-[var(--text-secondary)]">{count}</span> : null}
      </div>
      {children}
    </AppSurface>
  );
}

function PlayerName({ username }: { username: string }) {
  return <p className="min-w-0 truncate font-bold text-[var(--text-primary)]">{username}</p>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)]">{children}</p>;
}

function SearchResults({
  friendIds,
  onAnswerRequest,
  onSend,
  pendingAction,
  query,
  receivedByUser,
  results,
  searchError,
  searchState,
  sentByUser,
}: {
  friendIds: Set<string>;
  onAnswerRequest?: (requestId: string) => void;
  onSend?: (userId: string) => void;
  pendingAction?: string | null;
  query: string;
  receivedByUser: Map<string, { id: string }>;
  results: SocialSearchResult[];
  searchError?: string | null;
  searchState: "idle" | "loading" | "ready" | "error";
  sentByUser: Map<string, { id: string }>;
}) {
  const normalized = query.trim();
  if (normalized.length < 3) return <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)]">La recherche démarre à partir de 3 caractères.</p>;
  if (searchState === "loading") return <p className="mt-3 text-sm text-[var(--text-secondary)]">Recherche…</p>;
  if (searchState === "error") return <p className="mt-3 text-sm text-red-200" role="alert">{searchError ?? "Recherche impossible."}</p>;
  if (searchState === "ready" && results.length === 0) return <p className="mt-3 text-sm text-[var(--text-secondary)]">Aucun joueur trouvé.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {results.map((result) => {
        const received = receivedByUser.get(result.userId);
        const pending = pendingAction === `search:${result.userId}`;
        let action: React.ReactNode;
        if (friendIds.has(result.userId)) action = <span className="text-xs font-bold text-emerald-200">Déjà ami</span>;
        else if (sentByUser.has(result.userId)) action = <span className="text-xs font-bold text-[var(--text-secondary)]">Demande envoyée</span>;
        else if (received) action = <button className={appSecondaryActionClass} onClick={() => onAnswerRequest?.(received.id)} type="button">Répondre à la demande</button>;
        else action = <button className={appPrimaryActionClass} disabled={pending} onClick={() => onSend?.(result.userId)} type="button">{pending ? "Envoi…" : "Ajouter"}</button>;
        return <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3" key={result.userId}><PlayerName username={result.username} />{action}</li>;
      })}
    </ul>
  );
}
