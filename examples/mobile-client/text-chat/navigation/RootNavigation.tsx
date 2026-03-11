import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ChatScreen from '../screens/chat';
import HomeScreen from '../screens/home';

export type RootStackParamList = {
  Home: undefined;
  Chat: {
    roomName: string;
    userName: string;
  };
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootNavigation = () => {
  return (
    <RootStack.Navigator>
      <RootStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
    </RootStack.Navigator>
  );
};

export default RootNavigation;
