import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigation from './navigation/RootNavigation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FishjamProvider } from '@fishjam-cloud/mobile-client';

const App = () => {
  return (
    <FishjamProvider fishjamId={process.env.EXPO_PUBLIC_FISHJAM_ID}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigation />
        </NavigationContainer>
      </SafeAreaProvider>
    </FishjamProvider>
  );
};

export default App;
