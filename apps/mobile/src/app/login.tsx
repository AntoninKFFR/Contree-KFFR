import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useAccount } from "@/auth/AccountProvider";
import { AccountGate } from "@/components/AccountGate";
import { Brand, Button, Screen, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";

export default function LoginScreen() {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function signIn() {
    if (await account.signIn(email, password)) setPassword("");
  }
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AccountGate publicScreen>
        <Screen bottomInset>
          <Brand />
          <Text style={styles.eyebrow}>BIENVENUE À LA TABLE</Text>
          <Text accessibilityRole="header" style={styles.title}>La contrée,{"\n"}où que tu sois.</Text>
          <Text style={styles.body}>Retrouve ton compte KFFR et prépare tes prochaines parties.</Text>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.heading}>Connexion</Text>
            <Text style={styles.body}>Ton compte habituel, le même que sur le site.</Text>
            <Text style={styles.hint}>Adresse email</Text>
            <TextInput style={local.input} value={email} onChangeText={setEmail} editable={!account.submitting}
              autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              accessibilityLabel="Adresse email" placeholder="toi@exemple.fr" placeholderTextColor={tokens.colors.muted} />
            <Text style={styles.hint}>Mot de passe</Text>
            <TextInput style={local.input} value={password} onChangeText={setPassword} editable={!account.submitting}
              autoCapitalize="none" autoComplete="current-password" secureTextEntry textContentType="password"
              accessibilityLabel="Mot de passe" returnKeyType="go" onSubmitEditing={() => void signIn()} />
            {account.error ? <Text accessibilityRole="alert" style={styles.error}>{account.error}</Text> : null}
            <Button label={account.submitting ? "Connexion…" : "Se connecter"} disabled={account.submitting} onPress={() => void signIn()} />
          </View>
          <Text style={styles.hint}>Pour créer un compte ou te connecter avec Google, utilise encore le site KFFR.</Text>
        </Screen>
      </AccountGate>
    </KeyboardAvoidingView>
  );
}
const local = StyleSheet.create({
  input: { color: tokens.colors.text, backgroundColor: tokens.colors.background, borderRadius: 10, borderWidth: 1, borderColor: tokens.colors.border, minHeight: 52, padding: 14, fontSize: 16 },
});
