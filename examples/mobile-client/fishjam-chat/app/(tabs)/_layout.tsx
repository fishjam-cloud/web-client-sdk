import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandColors } from "../../utils/Colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BrandColors.darkBlue100,
        tabBarInactiveTintColor: "#8E8E93",
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="room"
        options={{
          title: "Room",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="videocam" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="livestream"
        options={{
          title: "Livestream",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
