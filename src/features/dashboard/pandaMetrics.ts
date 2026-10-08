export interface MetricSample {
  sampleTime: number;
  memoryBytes: number;
  hamTotal: number;
  spamTotal: number;
  deliveryTotal: number;
  authFailedTotal: number;
  authSuccessTotal: number;
  smtpConnections?: number;
  deliveryConnections?: number;
  imapConnections?: number;
  pop3Connections?: number;
  httpConnections?: number;
  sieveConnections?: number;
}
export interface MetricHistory {
  generatedTime: number;
  collectionStartTime: number | null;
  intervalSeconds: number;
  retentionDays: number;
  samples: MetricSample[];
  collectorError: string | null;
}
export function counterDelta(current: number, previous: number, elapsed: number, interval: number): number | null {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    elapsed <= 0 ||
    elapsed > interval * 2.5 ||
    current < previous
  )
    return null;
  return current - previous;
}
export function chartSamples(history: MetricHistory) {
  return history.samples.map((sample, index) => {
    const previous = history.samples[index - 1];
    const delta = (key: 'hamTotal' | 'spamTotal' | 'deliveryTotal' | 'authFailedTotal') =>
      previous
        ? counterDelta(sample[key], previous[key], sample.sampleTime - previous.sampleTime, history.intervalSeconds)
        : null;
    return {
      ...sample,
      memoryMiB: Math.round((sample.memoryBytes / 1048576) * 10) / 10,
      time: new Date(sample.sampleTime * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      ham: delta('hamTotal'),
      spam: delta('spamTotal'),
      delivered: delta('deliveryTotal'),
      authFailed: delta('authFailedTotal'),
    };
  });
}
