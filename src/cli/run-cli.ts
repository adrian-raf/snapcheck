import { ExitCode, UsageError, type CliIo } from './cli-io';
import {
  PROFILES_HELP,
  REQUIREMENTS_HELP,
  profilesCommand,
  requirementsCommand,
} from './commands/catalogue';
import { INBOX_HELP, inboxCommand } from './commands/inbox';
import { MOCK_HELP, mockCommand } from './commands/mock';
import { RUN_HELP, runCommand } from './commands/run';

const MAIN_HELP = `snapcheck — SNAP BI conformance testing

Usage: snapcheck <command> [options]

Commands:
  run           Run the conformance suite (mock or sandbox)
  mock          Start a mock SNAP server emulating a provider profile
  inbox         Start a notification inbox that verifies provider signatures
  profiles      List provider profiles
  requirements  List the requirement catalogue

Run "snapcheck <command> --help" for the options of a command.`;

interface Command {
  readonly help: string;
  readonly run: (argv: readonly string[], io: CliIo) => number | Promise<number>;
}

const COMMANDS: Readonly<Record<string, Command>> = {
  run: { help: RUN_HELP, run: runCommand },
  mock: { help: MOCK_HELP, run: mockCommand },
  inbox: { help: INBOX_HELP, run: inboxCommand },
  profiles: { help: PROFILES_HELP, run: profilesCommand },
  requirements: { help: REQUIREMENTS_HELP, run: requirementsCommand },
};

const HELP_FLAGS = new Set(['--help', '-h']);

/** Entry point of the CLI, independent of `process` so it can be tested. Resolves to an exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;

  if (name === undefined || HELP_FLAGS.has(name)) {
    io.stdout(MAIN_HELP);
    return name === undefined ? ExitCode.usage : ExitCode.ok;
  }

  const command = COMMANDS[name];
  if (!command) {
    io.stderr(`Unknown command "${name}".\n\n${MAIN_HELP}`);
    return ExitCode.usage;
  }
  if (rest.some((arg) => HELP_FLAGS.has(arg))) {
    io.stdout(command.help);
    return ExitCode.ok;
  }

  try {
    return await command.run(rest, io);
  } catch (error) {
    if (error instanceof UsageError || isParseArgsError(error)) {
      io.stderr(`${error.message}\n\n${command.help}`);
      return ExitCode.usage;
    }
    throw error;
  }
}

/** `util.parseArgs` throws TypeErrors with ERR_PARSE_ARGS_* codes for unknown or malformed options. */
function isParseArgsError(error: unknown): error is Error {
  return (
    error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS')
  );
}
