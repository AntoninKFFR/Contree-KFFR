import { Tabs, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "@/auth/AccountProvider";
import { tokens } from "@/theme/tokens";

export default function ConnectedLayout() {
  const { navigationIdentity } = useAccount();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const previousIdentity = useRef(navigationIdentity);
  useEffect(() => {
    if (previousIdentity.current !== navigationIdentity) {
      navigation.dispatch({ type: "RESET", payload: { index: 0, routes: [{ name: "(connected)" }] } });
      previousIdentity.current = navigationIdentity;
    }
  }, [navigationIdentity, navigation]);
  return (
    <Tabs initialRouteName="index" backBehavior="initialRoute" screenOptions={{
      headerShown: false, tabBarActiveTintColor: tokens.colors.accent, tabBarInactiveTintColor: tokens.colors.muted,
      tabBarStyle: { backgroundColor: tokens.colors.surface, borderTopColor: tokens.colors.border,
        height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom },
      tabBarItemStyle: { minHeight: 50, paddingVertical: 4 },
      tabBarLabelStyle: { fontSize: 13, fontWeight: "700" },
      sceneStyle: { backgroundColor: tokens.colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarAccessibilityLabel: "Onglet Accueil",
        tabBarIcon: ({ color }) => <Text accessible={false} style={{ color, fontSize: 24 }}>♠</Text> }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarAccessibilityLabel: "Onglet Profil",
        tabBarIcon: ({ color }) => <Text accessible={false} style={{ color, fontSize: 24 }}>♙</Text> }} />
    </Tabs>
  );
}
