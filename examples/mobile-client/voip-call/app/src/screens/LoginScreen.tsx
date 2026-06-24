import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '../user';

export function LoginScreen() {
  const { register } = useUser();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async () => {
    const name = input.trim();
    if (!name) return;
    setIsLoading(true);
    await register(name);
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>📞</Text>
        </View>

        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Choose a display name so others can call you.</Text>

        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Your name"
          placeholderTextColor="#9ca3af"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleContinue}
          editable={!isLoading}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, (!input.trim() || isLoading) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!input.trim() || isLoading}
          activeOpacity={0.85}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  button: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
