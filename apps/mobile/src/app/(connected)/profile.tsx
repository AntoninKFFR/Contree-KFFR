import { StyleSheet, Text, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { AccountGate } from "@/components/AccountGate";
import { Button, ErrorMessage, Screen, styles, Username, useGameLayout } from "@/components/ui";
import { tokens } from "@/theme/tokens";

export default function ProfileScreen() {
  const account = useAccount();
  const { largeText } = useGameLayout();
  return <AccountGate>
    <Screen title="Mon profil" back>
      <View style={styles.row}>
        <View testID="game-panel" style={styles.panel}>
          <View style={local.identity}>
            {!largeText ? <View style={local.avatar} accessible={false}><Text style={local.initial}>{Array.from(account.username?.trim() || "♠")[0].toLocaleUpperCase("fr")}</Text></View> : null}
            <View style={local.name}>
              {!largeText ? <Text style={styles.hint}>Pseudo KFFR</Text> : null}
              <Username username={account.username} />
            </View>
          </View>
          <Button label={largeText ? "Actualiser" : "Actualiser le profil"} accessibilityLabel="Actualiser le profil" secondary onPress={account.reload} disabled={account.submitting} />
        </View>
        <View testID="game-panel" style={styles.panel}>
          {!largeText ? <Text accessibilityRole="header" style={styles.heading}>Ma session</Text> : null}
          {account.error ? <ErrorMessage message={account.error} />
            : !largeText ? <Text style={styles.body}>Déconnexion sur cet appareil uniquement.</Text> : null}
          <Button label={account.submitting ? "Déconnexion…" : "Se déconnecter"} secondary onPress={account.signOut} disabled={account.submitting} />
        </View>
      </View>
    </Screen>
  </AccountGate>;
}
const local = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { flex: 1, minWidth: 0, gap: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: tokens.colors.accent, alignItems: "center", justifyContent: "center" },
  initial: { color: tokens.colors.accent, fontSize: 23, fontWeight: "700" },
});
