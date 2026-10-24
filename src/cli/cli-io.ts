/**
 * Everything the CLI does to the outside world, injected so commands are testable
 * without spawning processes or starting servers.
 */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Runs `playwright <args>` with extra environment variables; resolves to its exit code. */
  runPlaywright(args: readonly string[], env: Readonly<Record<string, string>>): Promise<number>;
  /** Starts the mock with extra environment variables; resolves once it is listening. */
  startMock(env: Readonly<Record<string, string>>): Promise<void>;
  /** Starts the notification inbox; resolves once it is listening. */
  startInbox(env: Readonly<Record<string, string>>): Promise<void>;
  /** Loads `KEY=value` lines from a file into `process.env` (existing variables win). */
  loadEnvFile(path: string): void;
  readonly env: NodeJS.ProcessEnv;
}

export const ExitCode = {
  ok: 0,
  /** Same as Playwright: at least one test failed. */
  testsFailed: 1,
  usage: 2,
} as const;

/** A mistake in how the CLI was called. Printed without a stack trace, exit code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
