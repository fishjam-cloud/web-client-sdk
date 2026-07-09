/**
 * Host-only overlay shown between rounds: type the phrase the viewers must
 * guess, then start the round. Positioned in the upper third so the keyboard
 * never covers it.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export function PhraseEntry({
  onSubmitPhrase,
  disabled,
}: {
  onSubmitPhrase: (phrase: string) => void;
  disabled: boolean;
}) {
  const [phrase, setPhrase] = useState('');
  const trimmedPhrase = phrase.trim();
  const canStart = !disabled && trimmedPhrase.length > 0;

  const handleStartRound = () => {
    if (!canStart) {
      return;
    }
    onSubmitPhrase(trimmedPhrase);
    setPhrase('');
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>New round</Text>
        <Text style={styles.subtitle}>
          Enter the phrase the viewers have to guess, then draw it.
        </Text>
        <TextInput
          value={phrase}
          onChangeText={setPhrase}
          placeholder="e.g. red apple"
          placeholderTextColor="rgba(255, 255, 255, 0.45)"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleStartRound}
        />
        <Pressable
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          disabled={!canStart}
          onPress={handleStartRound}>
          <Text style={styles.startButtonText}>
            {disabled ? 'Connecting…' : 'Start round'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // RN 0.85 removed StyleSheet.absoluteFillObject; this is its literal value.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  startButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#2563eb',
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
