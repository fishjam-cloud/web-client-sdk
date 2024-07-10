import type { Deferred } from './deferred';

export type Command = {
  handler: () => void;
  validate?: () => string | null;
  resolutionNotifier: Deferred<void>;
  resolve: 'after-renegotiation' | 'immediately';
};
