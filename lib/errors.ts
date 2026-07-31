export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class DataUnavailableError extends Error {
  readonly code = "DATA_UNAVAILABLE";

  constructor(message = "Market data is temporarily unavailable.") {
    super(message);
    this.name = "DataUnavailableError";
  }
}

export class ScanAlreadyRunningError extends Error {
  readonly code = "SCAN_ALREADY_RUNNING";

  constructor() {
    super("Another market snapshot is already running.");
    this.name = "ScanAlreadyRunningError";
  }
}

export class SnapshotFreshnessError extends Error {
  readonly code = "SNAPSHOT_FRESHNESS_ERROR";

  constructor(readonly details: {
    capturedAt: string;
    latestProviderUpdatedAt: string;
    totalAssets: number;
    unacceptableAssets: number;
    abortPercent: number;
  }) {
    super(
      `Snapshot freshness guard rejected ${details.unacceptableAssets}/${details.totalAssets} assets; ` +
      `capture=${details.capturedAt}, provider=${details.latestProviderUpdatedAt}.`
    );
    this.name = "SnapshotFreshnessError";
  }
}
