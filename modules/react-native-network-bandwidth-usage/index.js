import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { requireNativeModule } from 'expo-modules-core';

const NativeModule = Platform.OS === 'android' ? requireNativeModule('NetworkBandwidth') : null;

const trafficDelta = (current, previous) => {
  if (previous === null) {
    return 0;
  }

  if (current >= previous) {
    return current - previous;
  }

  return current;
};

/**
 * Monitorea uso de datos moviles de la app (Android).
 * Ignora trafico cuando la conexion es WiFi u otros tipos.
 */
export const startMobileAppBandwidthMonitor = ({ onUsageDelta, intervalMs = 1000 }) => {
  if (Platform.OS !== 'android' || !NativeModule) {
    return () => {};
  }

  let stopped = false;
  let lastRx = null;
  let lastTx = null;

  const timer = setInterval(async () => {
    if (stopped) {
      return;
    }

    const state = await NetInfo.fetch();
    if (state.type !== 'cellular') {
      lastRx = null;
      lastTx = null;
      return;
    }

    const { rxBytes, txBytes } = NativeModule.getAppTrafficBytes();

    const deltaRx = trafficDelta(rxBytes, lastRx);
    const deltaTx = trafficDelta(txBytes, lastTx);
    lastRx = rxBytes;
    lastTx = txBytes;

    if (deltaRx > 0 || deltaTx > 0) {
      onUsageDelta({ rxBytes: deltaRx, txBytes: deltaTx });
    }
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
};

export const isMobileBandwidthSupported = () => Platform.OS === 'android';
