import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AccountProvider, useAccount } from "@/auth/AccountProvider";
import { tokens } from "@/theme/tokens";

export default function RootLayout() {
  return <AccountProvider><AccountRoutes /></AccountProvider>;
}
function AccountRoutes() {
  const { navigationIdentity } = useAccount();
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.colors.background } }}>
      <Stack.Protected guard={!navigationIdentity}><Stack.Screen name="login" /></Stack.Protected>
      <Stack.Protected guard={Boolean(navigationIdentity)}><Stack.Screen name="(connected)" /></Stack.Protected>
    </Stack>
  </>;
}
