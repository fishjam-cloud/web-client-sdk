const FISHJAM_PREFIX = '[FISHJAM]';

export const getLogger = (enableLogging: boolean) =>
  ({
    debug: (arg: unknown, ...args: unknown[]) => {
      if (enableLogging) console.debug(FISHJAM_PREFIX, arg, ...args);
    },
    warn: (arg: unknown, ...args: unknown[]) => {
      if (enableLogging) console.warn(FISHJAM_PREFIX, arg, ...args);
    },
    error: (arg: unknown, ...args: unknown[]) => {
      if (enableLogging) console.error(FISHJAM_PREFIX, arg, ...args);
    },
  }) as const;
