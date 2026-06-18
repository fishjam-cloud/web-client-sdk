import React from 'react';
import { Keyboard, TouchableWithoutFeedback } from 'react-native';

export default function DismissKeyboard(props: React.PropsWithChildren) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {props.children}
    </TouchableWithoutFeedback>
  );
}
