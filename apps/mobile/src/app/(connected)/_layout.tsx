import { Tabs, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import { useAccount } from "@/auth/AccountProvider";
import { tokens } from "@/theme/tokens";

export default function ConnectedLayout() {
  const { navigationIdentity } = useAccount();
  const navigation = useNavigation();
  const previousIdentity = useRef(navigationIdentity);
  useEffect(() => {
    if (previousIdentity.current !== navigationIdentity) {
      navigation.dispatch({ type: "RESET", payload: { index: 0, routes: [{ name: "(connected)" }] } });
      previousIdentity.current = navigationIdentity;
    }
  }, [navigationIdentity, navigation]);
  return (
    <Tabs initialRouteName="index" backBehavior="initialRoute" tabBar={() => null} screenOptions={{
      // The routes are kept for auth/session navigation; no bottom tab bar anywhere.
      headerShown: false,
      sceneStyle: { backgroundColor: tokens.colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
      <Tabs.Screen name="solo" options={{ title: "Solo" }} />
    </Tabs>
  );
}
