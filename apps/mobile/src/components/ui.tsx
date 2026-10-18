import { useState, type ReactNode } from "react";
import { Link } from "expo-router";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import logo from "../../assets/kffr-logo.png";
import { WindowGuard } from "@/components/LandscapeFrame";
import { tokens } from "@/theme/tokens";

export function useGameLayout() {
  const { height, fontScale } = useWindowDimensions();
  return { compact: height < 380 || fontScale > 1.3, largeText: fontScale > 1.3, fontScale };
}
export function Brand() {
  return <Image source={logo} resizeMode="contain" style={styles.logo} accessibilityLabel="KFFR Contrée" />;
}
export function Screen({ children, bottomInset = false, title = "KFFR Contrée", back = false, profileLink = false }: {
  children: ReactNode; bottomInset?: boolean; title?: string; back?: boolean; profileLink?: boolean;
}) {
  return (
    <SafeAreaView testID="game-screen" style={styles.screen} edges={bottomInset ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]}>
      <View testID="game-header" style={styles.header}>
        <View style={styles.headerSide}>
          {back ? <Link href="/" replace asChild><Pressable accessibilityRole="link" accessibilityLabel="Retour à l’accueil" style={styles.headerButton}><Text style={styles.headerLink}>‹ Accueil</Text></Pressable></Link>
            : <Text style={styles.headerTitle}>{title}</Text>}
        </View>
        <Brand />
        <View style={[styles.headerSide, styles.headerRight]}>
          {profileLink ? <Link href="/profile" asChild><Pressable accessibilityRole="link" accessibilityLabel="Voir mon profil" style={styles.headerButton}><Text style={styles.headerLink}>Profil ›</Text></Pressable></Link>
            : back ? <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text> : null}
        </View>
      </View>
      <View testID="game-content" style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}
export function Button({ label, onPress, disabled = false, secondary = false, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, (disabled || pressed) && styles.dimmed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

/** Optional long content and keyboard entry scroll only inside this separate native modal. */
export function DetailDialog({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen"
    supportedOrientations={["landscape-left", "landscape-right"]} onRequestClose={onClose}>
    <WindowGuard>
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.dialogHeader}>
              <Text accessibilityRole="header" style={[styles.heading, { flex: 1 }]}>{title}</Text>
              <Button label="Fermer" secondary onPress={onClose} />
            </View>
            <ScrollView testID="secondary-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>{children}</ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </WindowGuard>
  </Modal>;
}

export function Username({ username }: { username: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState<{ username: string; width: number; fontScale: number } | null>(null);
  const { largeText, fontScale } = useGameLayout();
  if (!username) return <Text style={styles.heading}>Pseudo indisponible</Text>;
  // Conservatively route wide unbroken names to the full-text modal. Native text
  // measurement also catches multi-line scripts without truncation or font shrinking.
  const wideWord = width > 0 && username.split(/\s+/).some((word) =>
    Array.from(word).reduce((sum, char) => sum + (/[A-ZMWmw]/.test(char) ? 20 : char.charCodeAt(0) > 255 ? 24 : 13), 0) > width);
  // A portrait measurement must not keep a fitting name in the modal after rotation.
  const tooManyLines = overflow?.username === username && overflow.width === width && overflow.fontScale === fontScale;
  const needsDialog = Array.from(username).length > 22 || largeText || wideWord || tooManyLines;
  return <View style={{ alignSelf: "stretch" }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {!needsDialog ? <Text accessibilityLabel={"Pseudo KFFR : " + username} style={styles.heading}
      onTextLayout={(event) => { if (event.nativeEvent.lines.length > 2) setOverflow({ username, width, fontScale }); }}>{username}</Text> : <>
    <Button label={largeText ? "Mon pseudo" : "Voir mon pseudo"} accessibilityLabel="Voir mon pseudo" secondary onPress={() => setExpanded(true)} />
    <DetailDialog visible={expanded} title="Pseudo KFFR" onClose={() => setExpanded(false)}>
      <Text accessibilityLabel={"Pseudo KFFR : " + username} style={styles.heading}>{username}</Text>
    </DetailDialog>
    </>}
  </View>;
}
export function ErrorMessage({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const { largeText } = useGameLayout();
  if (!largeText) return <Text accessibilityRole="alert" style={styles.error}>{message}</Text>;
  return <>
    <Button label="Détails" accessibilityLabel="Détails de l’erreur" secondary onPress={() => setExpanded(true)} />
    <DetailDialog visible={expanded} title="Connexion KFFR" onClose={() => setExpanded(false)}>
      <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
    </DetailDialog>
  </>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: tokens.colors.background },
  header: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8 },
  headerSide: { flex: 1, minWidth: 0 },
  headerRight: { alignItems: "flex-end" },
  headerButton: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  headerTitle: { color: tokens.colors.muted, fontSize: 13, fontWeight: "600" },
  headerLink: { color: tokens.colors.accent, fontSize: 14, fontWeight: "700" },
  logo: { width: 80, height: 34 },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  heading: { color: tokens.colors.text, fontSize: 20, lineHeight: 25, fontWeight: "700" },
  body: { color: tokens.colors.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: tokens.colors.muted, fontSize: 12, lineHeight: 17 },
  panel: { flex: 1, minWidth: 0, padding: 14, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: tokens.colors.border, backgroundColor: tokens.colors.surface, justifyContent: "center" },
  row: { flex: 1, minHeight: 0, flexDirection: "row", gap: 12 },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, backgroundColor: tokens.colors.accent, alignItems: "center", justifyContent: "center" },
  buttonText: { color: tokens.colors.background, fontSize: 14, lineHeight: 20, fontWeight: "800", textAlign: "center" },
  secondaryButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: tokens.colors.border },
  secondaryText: { color: tokens.colors.accent },
  dimmed: { opacity: 0.6 },
  error: { color: tokens.colors.danger, fontSize: 13, lineHeight: 18 },
  modalSafe: { flex: 1, backgroundColor: "rgba(3,12,8,0.96)", padding: 8 },
  modalKeyboard: { flex: 1, justifyContent: "center", alignItems: "center" },
  dialog: { width: "100%", maxWidth: 720, flex: 1, minHeight: 0, borderRadius: 18, backgroundColor: tokens.colors.surface, borderWidth: 1, borderColor: tokens.colors.border },
  dialogHeader: { flexDirection: "row", alignItems: "center", padding: 8, paddingLeft: 16, gap: 12 },
  dialogContent: { padding: 16, gap: 12 },
});
