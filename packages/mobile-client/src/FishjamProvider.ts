import {
  FishjamProvider as ReactClientFishjamProvider,
  type FishjamProviderProps as ReactClientFishjamProviderProps,
} from '@fishjam-cloud/react-client';
import React from 'react';

import { ReactNativeDeviceManager } from './devices/ReactNativeDeviceManager';

// The native device manager owns persistence (in-memory for the app session),
// so persistLastDevice does not apply on mobile.
const deviceManager = new ReactNativeDeviceManager();

export type FishjamProviderProps = Omit<
  ReactClientFishjamProviderProps,
  'persistLastDevice' | 'fishjamClient' | 'deviceManager' | 'clientType'
>;

export function FishjamProvider(props: FishjamProviderProps) {
  return React.createElement(ReactClientFishjamProvider, {
    ...props,
    clientType: 'mobile',
    deviceManager,
  });
}
