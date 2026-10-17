import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { Button, ErrorMessage, Screen, styles, useGameLayout } from "@/components/ui";
import { tokens } from "@/theme/tokens";

/** Private data stays hidden while the navigator remains mounted during revalidation. */
export function AccountGate({ children, publicScreen = false }: { children: ReactNode; publicScreen?: boolean }) {
  const account = useAccount();
  const { largeText } = useGameLayout();
  if (account.configured && !account.loading && !account.signOutRequired && (publicScreen || account.session)) return children;
  return <Screen bottomInset={publicScreen} title="Mon compte">
    <View testID="game-panel" style={[styles.panel, { alignSelf: "center", width: "100%", maxWidth: 760 }, largeText && { flexDirection: "row", alignItems: "center" }]}>
      <View style={[{ gap: 10 }, largeText && { flex: 1 }]}>
        {!account.configured ? <>
          <Text accessibilityRole="header" style={styles.heading}>Connexion indisponible</Text>
          <Text style={styles.body}>Cette version ne peut pas se connecter à KFFR.</Text>
        </> : account.loading ? <>
          <ActivityIndicator color={tokens.colors.accent} accessibilityLabel="Vérification de la session" />
          <Text accessibilityRole="header" style={styles.heading}>Vérification…</Text>
        </> : <>
          <Text accessibilityRole="header" style={styles.heading}>{account.signOutIncomplete ? "Déconnexion à terminer" : "Session à vérifier"}</Text>
          {account.error ? <ErrorMessage message={account.error} /> : null}
        </>}
      </View>
      {account.configured ? <View style={[{ gap: 10, flexDirection: largeText || account.loading ? "column" : "row" }, largeText && { flex: 1 }]}>
        {!account.loading && !account.signOutIncomplete ? <View style={!largeText ? { flex: 1 } : undefined}><Button label="Réessayer" onPress={account.reload} disabled={account.submitting} /></View> : null}
        <View style={!largeText && !account.loading ? { flex: 1 } : undefined}><Button label={account.submitting ? "Déconnexion…" : "Déconnecter cet appareil"} secondary disabled={account.submitting} onPress={account.signOut} /></View>
      </View> : null}
    </View>
  </Screen>;
}
