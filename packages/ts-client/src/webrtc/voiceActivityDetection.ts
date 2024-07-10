import type { VadStatus } from './types';

const vadStatuses = ['speech', 'silence'] as const;

export const isVadStatus = (status: string): status is VadStatus =>
  vadStatuses.includes(status as VadStatus);
