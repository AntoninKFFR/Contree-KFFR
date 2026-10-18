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
              {!largeText ? <Text style={local.eyebrow}>JOUEUR KFFR</Text> : null}
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
  identity: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.sm },
  name: { flex: 1, minWidth: 0, gap: tokens.spacing.xxs },
  eyebrow: { ...tokens.type.eyebrow, color: tokens.colors.muted },
  avatar: { width: 52, height: 52, borderRadius: tokens.radius.round, borderWidth: 1, borderColor: tokens.colors.accent, backgroundColor: tokens.colors.inset, boxShadow: tokens.shadow.panel, alignItems: "center", justifyContent: "center" },
  initial: { ...tokens.type.heading, color: tokens.colors.accent },
});
