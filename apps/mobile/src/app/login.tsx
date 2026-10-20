import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { AccountGate } from "@/components/AccountGate";
import { Button, DetailDialog, Screen, styles, useGameLayout } from "@/components/ui";
import { tokens } from "@/theme/tokens";
import { ClubSignature } from "@/components/table-art";

export default function LoginScreen() {
  const account = useAccount();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const { compact, largeText } = useGameLayout();
  async function signIn() {
    if (await account.signIn(email, password)) { setPassword(""); setVisible(false); }
  }
  return <AccountGate publicScreen>
    <Screen bottomInset title="Bienvenue">
      <View style={styles.row} aria-hidden={visible} accessibilityElementsHidden={visible} importantForAccessibility={visible ? "no-hide-descendants" : "auto"}>
        <View style={local.welcome}>
          {!largeText ? <ClubSignature compact={compact} /> : <Text accessibilityRole="header" style={local.title}>À la table KFFR</Text>}
        </View>
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.heading}>Connexion</Text>
          {!largeText ? <Text style={styles.body}>Retrouve ton compte habituel.</Text> : null}
          <Button label="Se connecter" onPress={() => setVisible(true)} />
          {!largeText ? <Text style={styles.hint}>Inscription et Google : sur le site KFFR.</Text> : null}
        </View>
      </View>
      <DetailDialog visible={visible} title="Connexion KFFR" onClose={() => { setVisible(false); setPassword(""); }}>
        <Text style={styles.hint}>Adresse email</Text>
        <TextInput style={[local.input, focusedField === "email" && local.focusedInput]} value={email} onChangeText={setEmail} editable={!account.submitting}
          onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField(null)}
          autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
          accessibilityLabel="Adresse email" placeholder="toi@exemple.fr" placeholderTextColor={tokens.colors.muted} />
        <Text style={styles.hint}>Mot de passe</Text>
        <TextInput style={[local.input, focusedField === "password" && local.focusedInput]} value={password} onChangeText={setPassword} editable={!account.submitting}
          onFocus={() => setFocusedField("password")} onBlur={() => setFocusedField(null)}
          autoCapitalize="none" autoComplete="current-password" secureTextEntry textContentType="password"
          accessibilityLabel="Mot de passe" returnKeyType="go" onSubmitEditing={() => void signIn()} />
        {account.error ? <Text accessibilityRole="alert" style={styles.error}>{account.error}</Text> : null}
        <Button label={account.submitting ? "Connexion…" : "Se connecter"} disabled={account.submitting} onPress={() => void signIn()} />
      </DetailDialog>
    </Screen>
  </AccountGate>;
}
const local = StyleSheet.create({
  welcome: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  title: { ...tokens.type.heading, color: tokens.colors.text, textAlign: "center" },
  input: { color: tokens.colors.text, backgroundColor: tokens.colors.inset, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.colors.border, minHeight: 44, padding: tokens.spacing.sm, fontSize: 16 },
  focusedInput: { borderColor: tokens.colors.accent, backgroundColor: tokens.colors.background },
});
