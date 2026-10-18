import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAccount } from "@/auth/AccountProvider";
import { createSoloApi } from "./api";
import { createSoloController, initialSoloState, type SoloState } from "./controller";
import { soloEnvironment } from "@/solo/environment";

export function useSolo() {
  const account = useAccount(), accountRef = useRef(account);
  useEffect(() => { accountRef.current = account; }, [account]);
  const [binding, setBinding] = useState<{ owner: string; token: string; snapshot: SoloState; controller: ReturnType<typeof createSoloController> } | null>(null);
  const owner = account.session?.user.id, token = account.session?.access_token;
  useFocusEffect(useCallback(() => {
    if (!owner || !token) return;
    let live = true;
    const next = createSoloController({ owner, identity: () => accountRef.current.session,
      api: createSoloApi(soloEnvironment.fetcher), storage: soloEnvironment.storage, uuid: soloEnvironment.uuid,
      onChange: (value) => { if (live) setBinding({ owner, token, snapshot: value, controller: next }); }, unauthorized: () => accountRef.current.reload(),
    });
    const listener = AppState.addEventListener("change", (status) => { if (status !== "active") next.suspend(); });
    void next.load(); // GET saved ID only. Creating a game always needs a user press.
    return () => { live = false; listener.remove(); next.dispose(); setBinding(null); };
  }, [owner, token]));
  const live = binding && binding.owner === owner && binding.token === token;
  return { state: live ? binding.snapshot : initialSoloState, controller: live ? binding.controller : null };
}
