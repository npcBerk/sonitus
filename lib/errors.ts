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
