import {
  isMobileBandwidthSupported,
  startMobileAppBandwidthMonitor,
} from 'react-native-network-bandwidth-usage';

import { addMobileBandwidthUsage, getCurrentMonthBandwidthUsage } from './bandwidthDb';

const POLL_INTERVAL_MS = 5000;

export const refreshBandwidthUsage = () => getCurrentMonthBandwidthUsage();

export const startBandwidthTracking = (
  onUpdate: () => void,
) => {
  if (!isMobileBandwidthSupported()) {
    return () => {};
  }

  const stopMonitor = startMobileAppBandwidthMonitor({
    intervalMs: 1000,
    onUsageDelta: ({ rxBytes, txBytes }) => {
      void addMobileBandwidthUsage(rxBytes, txBytes).then(onUpdate);
    },
  });

  const pollTimer = setInterval(() => {
    void onUpdate();
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(pollTimer);
    stopMonitor();
  };
};
