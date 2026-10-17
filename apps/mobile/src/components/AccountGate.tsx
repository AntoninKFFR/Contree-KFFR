import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { Brand, Button, Screen, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";

/** Hide private content while leaving the navigator mounted across revalidation. */
export function AccountGate({ children, publicScreen = false }: { children: ReactNode; publicScreen?: boolean }) {
  const account = useAccount();
  if (account.configured && !account.loading && !account.signOutRequired && (publicScreen || account.session)) return children;
  return (
    <Screen bottomInset={publicScreen}>
      <Brand />
      <View style={styles.panel}>
        {!account.configured ? <>
          <Text accessibilityRole="header" style={styles.heading}>Connexion indisponible</Text>
          <Text style={styles.body}>La configuration KFFR de cette version est incomplète. Consulte le guide de démarrage du projet.</Text>
        </> : account.loading ? <>
          <ActivityIndicator color={tokens.colors.accent} accessibilityLabel="Vérification de la session" />
          <Text style={styles.heading}>Un instant…</Text>
          <Text style={styles.body}>Nous vérifions ta session KFFR.</Text>
          <Button label="Déconnecter cet appareil" secondary disabled={account.submitting} onPress={account.signOut} />
        </> : <>
          <Text accessibilityRole="header" style={styles.heading}>{account.signOutIncomplete ? "Déconnexion à terminer" : "Session à vérifier"}</Text>
          <Text style={styles.body}>Ton profil reste masqué tant que ta session ne peut pas être vérifiée.</Text>
          {account.error ? <Text accessibilityRole="alert" style={styles.error}>{account.error}</Text> : null}
          {!account.signOutIncomplete ? <Button label="Réessayer" onPress={account.reload} disabled={account.submitting} /> : null}
          <Button label={account.submitting ? "Déconnexion…" : "Déconnecter cet appareil"} secondary disabled={account.submitting} onPress={account.signOut} />
        </>}
      </View>
    </Screen>
  );
}
