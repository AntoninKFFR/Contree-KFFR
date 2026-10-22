import { Stack } from "expo-router/stack";
import { AccountGate } from "@/components/AccountGate";
import { useAccount } from "@/auth/AccountProvider";
import { TrainingProvider } from "@/training/provider";
import { View, StyleSheet } from "react-native";
export default function TrainingLayout() {
  const { session, navigationIdentity, configured, loading, signOutRequired } = useAccount();
  const visible = Boolean(configured && session && !loading && !signOutRequired);
  // Keep monotone challenge clocks alive during identity revalidation. The whole
  // private subtree is hidden from touch and accessibility until validation ends.
  // A real identity change replaces the provider and every private controller.
  return navigationIdentity ? <TrainingProvider key={navigationIdentity} userId={navigationIdentity}><View style={{ flex: 1 }}>
    <View style={{ flex: 1, opacity: visible ? 1 : 0 }} pointerEvents={visible ? "auto" : "none"} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? "auto" : "no-hide-descendants"} aria-hidden={!visible}><Stack screenOptions={{ headerShown: false }} /></View>
    {!visible ? <View style={StyleSheet.absoluteFill}><AccountGate bottomInset><View /></AccountGate></View> : null}
  </View></TrainingProvider> : <AccountGate bottomInset><View /></AccountGate>;
}
