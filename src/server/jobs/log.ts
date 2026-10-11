/**
 * Where the worker reports what it does: the console in the worker process
 * (the container's log), a spy in tests. Messages carry ids, never personal
 * data: errors go through describeError().
 */
export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};
