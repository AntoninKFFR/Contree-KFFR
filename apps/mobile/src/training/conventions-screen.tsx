import { trainingPanel } from "./panel";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, styles } from "@/components/ui";
import { biddingConventions } from "@/lib/training/conventions";
export function ConventionsScreen() {
  const router = useRouter();
  return <Screen title="Conventions KFFR" bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 16 }}><Text accessibilityRole="header" style={styles.heading}>Conventions d’annonces</Text><Text style={styles.body}>Ces conventions décrivent la doctrine utilisée par KFFR Contrée. Elles ne constituent pas une vérité universelle sur la Contrée.</Text><Text style={styles.hint}>Advanced Rules V4.1 · Axe annonces version 1</Text>{biddingConventions.map((section) => <View key={section.title} style={[trainingPanel, { flex: undefined, flexShrink: 0 }]}><Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>{section.paragraphs.map((p, i) => <Text key={i} accessibilityRole={p.kind === "h3" ? "header" : undefined} style={p.kind === "h3" ? styles.heading : styles.body}>{p.kind === "li" ? "• " : ""}{p.text}</Text>)}</View>)}<Button label="Faire son annonce" onPress={() => router.replace({ pathname: "/training/[axis]", params: { axis: "bidding", level: "1" } })} /><Button label="Lire les enchères" secondary onPress={() => router.replace({ pathname: "/training/[axis]", params: { axis: "bid-reading", level: "1" } })} /></ScrollView></Screen>;
}
