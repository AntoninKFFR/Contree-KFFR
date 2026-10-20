import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AccountProvider, useAccount } from "@/auth/AccountProvider";
import { tokens } from "@/theme/tokens";
import { LandscapeFrame } from "@/components/LandscapeFrame";
import { warmGameImages } from "@/components/image-assets";

export default function RootLayout() {
  useEffect(() => { void warmGameImages(); }, []);
  return <AccountProvider><LandscapeFrame><AccountRoutes /></LandscapeFrame></AccountProvider>;
}
function AccountRoutes() {
  const { navigationIdentity } = useAccount();
  return <>
    <StatusBar style="light" hidden />
    <Stack screenOptions={{ headerShown: false, orientation: "landscape", contentStyle: { backgroundColor: tokens.colors.background } }}>
      <Stack.Protected guard={!navigationIdentity}><Stack.Screen name="login" /></Stack.Protected>
      <Stack.Protected guard={Boolean(navigationIdentity)}><Stack.Screen name="(connected)" /></Stack.Protected>
    </Stack>
  </>;
}
