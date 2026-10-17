import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Brand, Screen, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";

const modes = [
  { symbol: "♠", title: "Jouer en solo", description: "Une table pour toi, le plaisir de la contrée." },
  { symbol: "♥", title: "Multijoueur", description: "Retrouve tes amis autour d’une même table." },
  { symbol: "♣", title: "Entraînement", description: "Affûte ton jeu, une donne après l’autre." },
];
export default function HomeScreen() {
  return (
    <AccountGate>
      <Screen>
        <Brand />
        <Text style={styles.eyebrow}>À TOI DE JOUER</Text>
        <Text accessibilityRole="header" style={styles.title}>La contrée,{"\n"}en solo ou{"\n"}entre amis.</Text>
        <Text style={styles.body}>Les cartes nous rassemblent. Ton espace KFFR prend place sur iPhone.</Text>
        <View style={local.sectionHeading}>
          <Text accessibilityRole="header" style={styles.heading}>Choisis ta table</Text>
          <Text style={styles.hint}>Les modes natifs arrivent bientôt.</Text>
        </View>
        {modes.map((mode) => (
          <Pressable key={mode.title} disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
            accessibilityLabel={mode.title + ". Bientôt disponible sur iPhone."} style={local.mode}>
            <Text accessible={false} style={local.symbol}>{mode.symbol}</Text>
            <View style={local.modeCopy}>
              <Text style={local.modeTitle}>{mode.title}</Text>
              <Text style={styles.hint}>{mode.description}</Text>
              <Text style={local.badge}>Bientôt disponible</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.panel}>
          <Text style={styles.heading}>Ton compte, à portée de main.</Text>
          <Text style={styles.body}>Retrouve ton pseudo KFFR dans ton profil.</Text>
          <Link href="/profile" asChild>
            <Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>Voir mon profil</Text></Pressable>
          </Link>
        </View>
      </Screen>
    </AccountGate>
  );
}
const local = StyleSheet.create({
  sectionHeading: { gap: 6, marginTop: 12 },
  mode: { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border, borderWidth: 1, borderRadius: 18, padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 16 },
  symbol: { fontSize: 32, color: tokens.colors.accent },
  modeCopy: { flex: 1, gap: 8 },
  modeTitle: { fontSize: 19, lineHeight: 25, fontWeight: "700", color: tokens.colors.text },
  badge: { color: tokens.colors.accent, fontSize: 12, lineHeight: 19, fontWeight: "700" },
});
