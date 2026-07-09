/**
 * Winner banner shown on every client while the game is in `round_won`
 * (the state machine holds that phase for 5 seconds, then resets — this
 * component has no timer of its own).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function GuessBanner({
  winnerName,
  phrase,
}: {
  winnerName: string;
  phrase: string;
}) {
  return (
    <View style={styles.banner} pointerEvents="none">
      <Text style={styles.title}>🎉 {winnerName} guessed it!</Text>
      <Text style={styles.phrase}>“{phrase}”</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 110,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  phrase: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
  },
});
