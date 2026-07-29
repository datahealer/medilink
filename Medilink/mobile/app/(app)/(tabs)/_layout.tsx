import React from "react";
import { Tabs } from "expo-router";

import { BottomTabBar } from "@/components/ui";

/**
 * Authenticated tab navigator (Design Doc p14–16): Home · Search · Me · Records ·
 * Profile, rendered with the brand BottomTabBar (central Me submark, RTL-aware,
 * safe-area aware). Detail screens (edit profile, medical history, family add/edit,
 * patient switcher) live OUTSIDE this group so they push full-screen with no tab bar.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      backBehavior="history"
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="me" />
      <Tabs.Screen name="records" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
