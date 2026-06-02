export type BandwidthDelta = {
  rxBytes: number;
  txBytes: number;
};

export type BandwidthMonitorOptions = {
  onUsageDelta: (delta: BandwidthDelta) => void;
  intervalMs?: number;
};

export const startMobileAppBandwidthMonitor: (
  options: BandwidthMonitorOptions,
) => () => void;

export const isMobileBandwidthSupported: () => boolean;
