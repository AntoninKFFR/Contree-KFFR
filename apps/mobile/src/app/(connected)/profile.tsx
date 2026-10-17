import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { AccountGate } from "@/components/AccountGate";
import { Brand, Button, Screen, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";

export default function ProfileScreen() {
  const account = useAccount();
  return (
    <AccountGate>
      <Screen>
        <Brand />
        <Link href="/" asChild replace>
          <Pressable accessibilityRole="button" accessibilityLabel="Retour à l’accueil" style={local.back}>
            <Text style={local.backText}>‹  Accueil</Text>
          </Pressable>
        </Link>
        <Text style={styles.eyebrow}>MON ESPACE KFFR</Text>
        <Text accessibilityRole="header" style={styles.title}>Mon profil</Text>
        <View style={styles.panel}>
          <View style={local.avatar} accessible={false}><Text style={local.initial}>{account.username?.trim().charAt(0).toLocaleUpperCase("fr") || "♠"}</Text></View>
          <Text style={styles.hint}>Pseudo KFFR</Text>
          {account.username ? <Text accessibilityLabel={"Pseudo KFFR : " + account.username} style={local.username}>{account.username}</Text>
            : <Text style={styles.body}>Pseudo indisponible</Text>}
          <Text style={styles.body}>Le même compte et le même profil que sur le site.</Text>
          {account.error ? <Text accessibilityRole="alert" style={styles.error}>{account.error}</Text> : null}
          {!account.username ? <Text style={styles.hint}>Réessaie avec du réseau. Si ton pseudo n’est pas encore renseigné, complète ton profil sur le site KFFR.</Text> : null}
          <Button label="Actualiser le profil" secondary onPress={account.reload} disabled={account.submitting} />
        </View>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.heading}>Session sur cet iPhone</Text>
          <Text style={styles.body}>La déconnexion concerne cet appareil. Tu restes connecté sur le site.</Text>
          <Button label={account.submitting ? "Déconnexion…" : "Se déconnecter"} secondary onPress={account.signOut} disabled={account.submitting} />
        </View>
      </Screen>
    </AccountGate>
  );
}
const local = StyleSheet.create({
  back: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingRight: 16 },
  backText: { color: tokens.colors.accent, fontSize: 16, fontWeight: "600" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: tokens.colors.background, borderWidth: 1, borderColor: tokens.colors.accent, alignItems: "center", justifyContent: "center" },
  initial: { color: tokens.colors.accent, fontSize: 28, fontWeight: "700" },
  username: { color: tokens.colors.text, fontSize: 29, lineHeight: 37, fontWeight: "800", flexShrink: 1 },
});
