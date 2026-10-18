import { Tabs, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import { GameNavigation } from "@/components/GameNavigation";
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
    <Tabs initialRouteName="index" backBehavior="initialRoute" tabBar={({ state, navigation: tabs }) => (
      <GameNavigation active={state.routes[state.index].name} onSelect={(name) => {
        const route = state.routes.find((item) => item.name === name);
        if (!route) return;
        const event = tabs.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented) tabs.navigate(name);
      }} />
    )} screenOptions={{
      headerShown: false, tabBarActiveTintColor: tokens.colors.accent, tabBarInactiveTintColor: tokens.colors.muted,
      sceneStyle: { backgroundColor: tokens.colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
