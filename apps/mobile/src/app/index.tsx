import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createAccountController, initialAccountState } from "@/lib/account";
import { supabase } from "@/lib/supabase";
import { tokens } from "@/theme/tokens";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [accountState, setAccountState] = useState(initialAccountState);
  const account = useRef<ReturnType<typeof createAccountController> | null>(null);
  const { session, username, loading, submitting, error, signOutRequired, signOutIncomplete } = accountState;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const controller = createAccountController(supabase, setAccountState);
    account.current = controller;
    controller.setForeground(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (next) => {
      controller.setForeground(next === "active");
    });
    return () => {
      listener.remove();
      controller.dispose();
      account.current = null;
    };
  }, []);

  async function signIn() {
    const controller = account.current;
    if (await controller?.signIn(email, password) && account.current === controller) setPassword("");
  }

  function signOut() {
    setPassword("");
    void account.current?.signOut();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top, 24) + 24, paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
      >
        <Text style={styles.eyebrow}>KFFR · CONTRÉE</Text>
        <Text style={styles.title}>La Contrée, dans ta poche.</Text>
        <Text style={styles.lead}>Une nouvelle expérience iPhone. Tes comptes KFFR restent les mêmes.</Text>

        <View style={styles.panel}>
          {!supabase ? (
            <>
              <Text style={styles.heading}>Configuration requise</Text>
              <Text style={styles.body}>Crée apps/mobile/.env à partir de .env.example avec l’URL et la clé publique Supabase du projet KFFR Contrée, puis redémarre Expo.</Text>
            </>
          ) : loading ? (
            <>
              <ActivityIndicator color={tokens.colors.accent} accessibilityLabel="Chargement du compte" />
              <Pressable style={styles.secondaryButton} onPress={signOut} disabled={submitting} accessibilityRole="button">
                <Text style={styles.secondaryText}>Déconnecter cet appareil</Text>
              </Pressable>
            </>
          ) : signOutRequired ? (
            <>
              <Text style={styles.heading}>{signOutIncomplete ? "Déconnexion à terminer" : "Session à vérifier"}</Text>
              <Text style={styles.body}>Ton profil reste masqué tant que ta session ne peut pas être vérifiée.</Text>
              {!signOutIncomplete ? <Pressable style={styles.secondaryButton} onPress={() => void account.current?.reload()} disabled={submitting} accessibilityRole="button">
                <Text style={styles.secondaryText}>Réessayer</Text>
              </Pressable> : null}
              <Pressable style={styles.secondaryButton} onPress={signOut} disabled={submitting} accessibilityRole="button">
                <Text style={styles.secondaryText}>{submitting ? "Déconnexion…" : "Déconnecter cet appareil"}</Text>
              </Pressable>
            </>
          ) : session ? (
            <>
              <Text style={styles.heading}>Bienvenue{username ? ` ${username}` : ""} !</Text>
              <Text style={styles.body}>Tu utilises le même compte que sur le site KFFR.</Text>
              {!username ? <Text style={styles.hint}>Pseudo indisponible. Tu peux réessayer ou compléter ton profil sur le site.</Text> : null}
              <Pressable onPress={() => void account.current?.reload()} disabled={submitting} accessibilityRole="button" style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Actualiser le profil</Text>
              </Pressable>
              <View style={styles.rule} />
              <Text style={styles.coming}>La table de jeu native arrive au prochain lot.</Text>
              <Pressable style={[styles.secondaryButton, submitting && styles.disabled]} onPress={signOut} disabled={submitting} accessibilityRole="button">
                <Text style={styles.secondaryText}>Se déconnecter</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Connexion</Text>
              <Text style={styles.body}>Utilise ton compte KFFR existant.</Text>
              <TextInput
                style={styles.input}
                placeholder="Adresse email"
                placeholderTextColor={tokens.colors.muted}
                editable={!submitting}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Adresse email"
              />
              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor={tokens.colors.muted}
                editable={!submitting}
                autoCapitalize="none"
                autoComplete="current-password"
                secureTextEntry
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void signIn()}
                accessibilityLabel="Mot de passe"
              />
              <Pressable style={[styles.button, submitting && styles.disabled]} onPress={() => void signIn()} disabled={submitting} accessibilityRole="button">
                <Text style={styles.buttonText}>{submitting ? "Connexion…" : "Se connecter"}</Text>
              </Pressable>
              <Text style={styles.hint}>Pour créer un compte ou te connecter avec Google, utilise encore la version web.</Text>
            </>
          )}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </View>
        <Text style={styles.footer}>Version Expo Go · Fondation iOS</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.colors.background },
  container: { flexGrow: 1, paddingHorizontal: 22, justifyContent: "center", gap: 16 },
  eyebrow: { fontSize: 12, letterSpacing: 3, fontWeight: "700", color: tokens.colors.accent },
  title: { fontSize: 31, fontWeight: "800", color: tokens.colors.text, lineHeight: 38 },
  lead: { fontSize: 15, lineHeight: 22, color: tokens.colors.muted, marginBottom: 12 },
  panel: { borderWidth: 1, borderColor: tokens.colors.border, borderRadius: 18, backgroundColor: tokens.colors.surface, padding: 20, gap: 14 },
  heading: { color: tokens.colors.text, fontSize: 22, fontWeight: "800" },
  body: { color: tokens.colors.muted, fontSize: 14, lineHeight: 21 },
  hint: { color: tokens.colors.muted, fontSize: 12, lineHeight: 18 },
  input: { color: tokens.colors.text, backgroundColor: tokens.colors.background, borderRadius: 10, borderWidth: 1, borderColor: tokens.colors.border, minHeight: 49, paddingHorizontal: 14, fontSize: 16 },
  button: { backgroundColor: tokens.colors.accent, paddingVertical: 15, borderRadius: 10, alignItems: "center", minHeight: 48 },
  buttonText: { color: tokens.colors.background, fontSize: 16, fontWeight: "800" },
  secondaryButton: { borderWidth: 1, borderColor: tokens.colors.accent, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 12, minHeight: 48 },
  secondaryText: { color: tokens.colors.accent, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  rule: { height: 1, backgroundColor: tokens.colors.border, marginVertical: 2 },
  coming: { color: tokens.colors.accent, fontSize: 14, fontWeight: "600" },
  error: { color: tokens.colors.danger, fontSize: 13, lineHeight: 20 },
  footer: { textAlign: "center", color: tokens.colors.muted, fontSize: 11, marginTop: 18 },
});
