import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdditionalColors, BrandColors, TextColors } from '../theme/colors';
import { useUser } from '../user';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FishjamLogo = require('../../assets/images/fishjam-logo.png');

export function LoginScreen() {
  const { register } = useUser();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleContinue = async () => {
    const name = input.trim();
    if (!name) return;
    setIsLoading(true);
    try {
      await register(name);
    } finally {
      setIsLoading(false);
    }
  };

  const disabled = !input.trim() || isLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <Image
            style={styles.logo}
            source={FishjamLogo}
            resizeMode="contain"
          />

          <View style={styles.iconWrap}>
            <MaterialCommunityIcons
              name="phone"
              size={40}
              color={AdditionalColors.white}
            />
          </View>

          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>
            Choose a display name so others can call you.
          </Text>

          <TextInput
            style={[styles.input, isFocused && styles.inputFocused]}
            value={input}
            onChangeText={setInput}
            placeholder="Your name"
            placeholderTextColor={AdditionalColors.grey80}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleContinue}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!isLoading}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={disabled}
            activeOpacity={0.85}>
            {isLoading ? (
              <ActivityIndicator color={AdditionalColors.white} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BrandColors.seaBlue20 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  logo: {
    width: 160,
    height: 50,
    marginBottom: 8,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: BrandColors.darkBlue100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: TextColors.darkText,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: AdditionalColors.grey80,
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 56,
    borderWidth: 2,
    borderColor: BrandColors.darkBlue100,
    borderRadius: 40,
    paddingHorizontal: 20,
    fontSize: 16,
    color: TextColors.darkText,
    backgroundColor: AdditionalColors.white,
  },
  inputFocused: {
    borderColor: BrandColors.seaBlue80,
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: BrandColors.darkBlue100,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: AdditionalColors.grey60,
  },
  buttonText: {
    color: AdditionalColors.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
