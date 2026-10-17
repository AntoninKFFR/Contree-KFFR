import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { tokens } from "@/theme/tokens";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle<{ username: string | null }>();
    if (profileError) throw profileError;
    setUsername(data?.username ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    let active = true;
    void client.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError("Session indisponible. Vérifie ta connexion.");
      setSession(data.session);
      if (data.session) {
        try { await readProfile(data.session.user.id); }
        catch { if (active) setError("Impossible de charger ton pseudo."); }
      }
    }).catch(() => {
      if (active) setError("Connexion au serveur impossible.");
    }).finally(() => { if (active) setLoading(false); });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setUsername(null);
      } else {
        void readProfile(next.user.id).catch(() => {
          if (active) setError("Impossible de charger ton pseudo.");
        });
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [readProfile]);

  async function signIn() {
    if (!supabase || submitting) return;
    if (!email.trim() || !password) {
      setError("Renseigne ton email et ton mot de passe.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) setError("Connexion refusée. Vérifie tes identifiants.");
      else setPassword("");
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (!supabase || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signOut();
      if (authError) setError("Déconnexion impossible. Réessaie.");
    } catch {
      setError("Déconnexion impossible. Réessaie.");
    } finally {
      setSubmitting(false);
    }
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
            <ActivityIndicator color={tokens.colors.accent} accessibilityLabel="Chargement du compte" />
          ) : session ? (
            <>
              <Text style={styles.heading}>Bienvenue{username ? ` ${username}` : ""} !</Text>
              <Text style={styles.body}>Tu utilises le même compte que sur le site KFFR.</Text>
              {!username ? <Text style={styles.hint}>Aucun pseudo enregistré : complète ton profil sur le site avant de continuer.</Text> : null}
              <View style={styles.rule} />
              <Text style={styles.coming}>La table de jeu native arrive au prochain lot.</Text>
              <Pressable style={[styles.secondaryButton, submitting && styles.disabled]} onPress={() => void signOut()} disabled={submitting} accessibilityRole="button">
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
