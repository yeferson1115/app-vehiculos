import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'Login' }} />
      <Tabs.Screen name="explore" options={{ title: 'Nueva inspección' }} />
    </Tabs>
  );
}
