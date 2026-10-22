import { NativeTraining } from "./training";
import { SearchParamsContext , RouteContext } from "./router";
import { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import Home from "../../src/app/(connected)/index";
import Profile from "../../src/app/(connected)/profile";
import Login from "../../src/app/login";
import Multiplayer from "../../src/app/(connected)/multiplayer";
import Solo from "../../src/app/(connected)/solo";
import { WindowGuard } from "../../src/components/LandscapeFrame";
import { VisualAccountContext } from "./account";
import { initialAccountState } from "../../src/lib/account";
import SalonProposal from "./proposals/salon";
import { localBackend } from "./local-backend";
const params = new URLSearchParams(location.search);
const renders: { phase: string; duration: number }[] = [];
Object.assign(globalThis, { __nativeRenderMetrics: renders });
function Harness() {
  const [route, setRoute] = useState(params.get("screen") || "home");
  const [search, setSearch] = useState<Record<string, string>>({ axis: params.get("axis") || "", level: params.get("level") || "1", mode: params.get("mode") || "" });
  const [status, setStatus] = useState(params.get("state") || "ready");
  const connected = route !== "login";
  const session = connected && status === "ready" ? localBackend?.session ?? { user: { id: "visual-test-only" }, access_token: "visual-test-only-token" } as Session : null;
  return <VisualAccountContext.Provider value={{
    ...initialAccountState, session, username: session ? params.get("username") || "Antonin KFFR" : null,
    configured: status !== "configuration", loading: status === "loading", signOutRequired: ["offline", "logout"].includes(status),
    signOutIncomplete: status === "logout", error: status === "offline" ? "Connexion au serveur impossible. Vérifie ton réseau et réessaie." : null,
    reload: () => setStatus("ready"), signOut: () => { setRoute("login"); setStatus("ready"); },
    signIn: async () => { setRoute("home"); setStatus("ready"); return true; },
  }}>
    <SearchParamsContext.Provider value={search}><RouteContext.Provider value={(href) => { if (typeof href !== "string") { setSearch(Object.fromEntries(Object.entries(href.params ?? {}).map(([k, v]) => [k, String(v)]))); setRoute("training"); } else { if (href === "/training") setSearch({}); setRoute(href === "/training" ? "training" : href === "/profile" ? "profile" : href === "/solo" ? "solo" : href === "/multiplayer" ? "multiplayer" : "home"); } }}>
      <View style={{ flex: 1, height: "100%" }}>
        <Profiler id="native-route" onRender={(_id, phase, duration) => { if (params.has("perf")) renders.push({ phase, duration }); }}><WindowGuard>
          {route === "login" ? <Login /> : <View style={{ flex: 1, minHeight: 0 }}>
            {route === "training" ? <NativeTraining axis={search.axis} /> : route === "profile" ? <Profile /> : route === "solo" ? <Solo /> : route === "multiplayer" ? <Multiplayer /> : params.get("proposal") === "salon" ? <SalonProposal /> : <Home />}
          </View>}
        </WindowGuard></Profiler>
      </View>
    </RouteContext.Provider></SearchParamsContext.Provider>
  </VisualAccountContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
