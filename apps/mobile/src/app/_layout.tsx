import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { tokens } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.colors.background },
      }} />
    </>
  );
}
