import { useUpdatePeerMetadata } from '@fishjam-cloud/react-native-client';
import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandColors } from '../utils/Colors';

type PeerMetadata = { displayName: string };

type PeerMetadataEditorProps = {
  visible: boolean;
  onRequestClose: () => void;
  currentDisplayName: string;
};

export default function PeerMetadataEditor({
  visible,
  onRequestClose,
  currentDisplayName,
}: PeerMetadataEditorProps) {
  const { updatePeerMetadata } = useUpdatePeerMetadata<PeerMetadata>();
  const [draft, setDraft] = useState(currentDisplayName);

  React.useEffect(() => {
    if (visible) setDraft(currentDisplayName);
  }, [visible, currentDisplayName]);

  const handleSave = useCallback(() => {
    const name = draft.trim() || currentDisplayName;
    updatePeerMetadata({ displayName: name });
    onRequestClose();
  }, [draft, currentDisplayName, updatePeerMetadata, onRequestClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Display name"
            placeholderTextColor={BrandColors.darkBlue60}
            autoCapitalize="words"
          />
          <View style={styles.actions}>
            <Pressable onPress={onRequestClose} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={styles.primary}>
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
    color: BrandColors.darkBlue100,
  },
  input: {
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: BrandColors.darkBlue100,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: BrandColors.darkBlue80,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: BrandColors.darkBlue100,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
