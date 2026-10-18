import { useState, type ReactNode } from "react";
import { Link } from "expo-router";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import logo from "../../assets/kffr-logo.png";
import { WindowGuard } from "@/components/LandscapeFrame";
import { tokens } from "@/theme/tokens";
import Animated from "react-native-reanimated";
import { useMotionPreference } from "@/components/use-motion-preference";
import { TableBackdrop } from "@/components/table-art";

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
  const [focusedLink, setFocusedLink] = useState<"back" | "profile" | null>(null);
  return (
    <SafeAreaView testID="game-screen" style={styles.screen} edges={bottomInset ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]}>
      <TableBackdrop />
      <View testID="game-header" style={styles.header}>
        <View style={styles.headerSide}>
          {back ? <Link href="/" replace asChild><Pressable accessibilityRole="link" accessibilityLabel="Retour à l’accueil" onFocus={() => setFocusedLink("back")} onBlur={() => setFocusedLink(null)} style={[styles.headerButton, focusedLink === "back" && tokens.focus]}><Text style={styles.headerLink}>‹ Accueil</Text></Pressable></Link>
            : <Text style={styles.headerTitle}>{title}</Text>}
        </View>
        <Brand />
        <View style={[styles.headerSide, styles.headerRight]}>
          {profileLink ? <Link href="/profile" asChild><Pressable accessibilityRole="link" accessibilityLabel="Voir mon profil" onFocus={() => setFocusedLink("profile")} onBlur={() => setFocusedLink(null)} style={[styles.headerButton, focusedLink === "profile" && tokens.focus]}><Text style={styles.headerLink}>Profil ›</Text></Pressable></Link>
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
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useMotionPreference();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.buttonTarget, focused && !disabled && tokens.focus]}>
    <Animated.View style={[styles.button, secondary && styles.secondaryButton, {
      transform: [{ scale: pressed && !disabled && !reducedMotion ? tokens.motion.pressScale : 1 }],
      transitionProperty: "transform", transitionDuration: reducedMotion ? 0 : tokens.motion.pressDuration,
      transitionTimingFunction: tokens.motion.easing,
    }, pressed && !disabled && (secondary ? styles.secondaryPressed : styles.primaryPressed), disabled && styles.unavailable]}>
      <Text style={[styles.buttonText, (secondary || disabled) && styles.secondaryText]}>{label}</Text>
    </Animated.View>
  </Pressable>;
}

/** Optional long content and keyboard entry scroll only inside this separate native modal. */
export function DetailDialog({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const reducedMotion = useMotionPreference();
  return <Modal visible={visible} transparent animationType={reducedMotion ? "none" : "fade"} presentationStyle="overFullScreen"
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
  header: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: tokens.spacing.md, gap: tokens.spacing.xs },
  headerSide: { flex: 1, minWidth: 0 },
  headerRight: { alignItems: "flex-end" },
  headerButton: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  headerTitle: { ...tokens.type.caption, color: tokens.colors.muted, fontWeight: "600", letterSpacing: 1 },
  headerLink: { ...tokens.type.label, color: tokens.colors.accent },
  logo: { width: 80, height: 34 },
  content: { flex: 1, minHeight: 0, paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.xxs, paddingBottom: tokens.spacing.xs },
  heading: { ...tokens.type.heading, color: tokens.colors.text },
  body: { ...tokens.type.body, color: tokens.colors.muted },
  hint: { ...tokens.type.caption, color: tokens.colors.muted },
  panel: { flex: 1, minWidth: 0, padding: tokens.spacing.md, gap: tokens.spacing.sm, borderRadius: tokens.radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: tokens.colors.border, backgroundColor: tokens.colors.surface, boxShadow: tokens.shadow.panel, justifyContent: "center" },
  row: { flex: 1, minHeight: 0, flexDirection: "row", gap: tokens.spacing.sm },
  buttonTarget: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  button: { minHeight: 44, paddingHorizontal: tokens.spacing.sm, paddingVertical: tokens.spacing.xs, borderRadius: tokens.radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: tokens.colors.accent, backgroundColor: tokens.colors.accent, boxShadow: tokens.shadow.button, alignItems: "center", justifyContent: "center" },
  buttonText: { ...tokens.type.label, color: tokens.colors.accentInk, textAlign: "center" },
  secondaryButton: { backgroundColor: tokens.colors.inset, borderColor: tokens.colors.border, boxShadow: "none" },
  secondaryText: { color: tokens.colors.accent },
  primaryPressed: { backgroundColor: tokens.colors.accentPressed, boxShadow: "none" },
  secondaryPressed: { backgroundColor: tokens.colors.raised, borderColor: tokens.colors.accent },
  unavailable: { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border, boxShadow: "none" },
  error: { ...tokens.type.caption, color: tokens.colors.danger },
  modalSafe: { flex: 1, backgroundColor: tokens.colors.scrim, padding: tokens.spacing.xs },
  modalKeyboard: { flex: 1, justifyContent: "center", alignItems: "center" },
  dialog: { width: "100%", maxWidth: 720, flex: 1, minHeight: 0, borderRadius: tokens.radius.lg, borderCurve: "continuous", backgroundColor: tokens.colors.surface, borderWidth: 1, borderColor: tokens.colors.border, boxShadow: tokens.shadow.panel },
  dialogHeader: { flexDirection: "row", alignItems: "center", padding: tokens.spacing.xs, paddingLeft: tokens.spacing.md, gap: tokens.spacing.sm, borderBottomWidth: 1, borderColor: tokens.colors.hairline },
  dialogContent: { padding: tokens.spacing.md, gap: tokens.spacing.sm },
});
