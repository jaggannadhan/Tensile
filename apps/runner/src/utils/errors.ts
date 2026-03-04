export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class FilesystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesystemError";
  }
}
