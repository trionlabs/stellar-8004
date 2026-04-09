export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  msg: string;
  contract?: string;
  event?: string;
  ledger?: number;
  eventId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  const { level, msg, ...rest } = entry;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...rest });

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
