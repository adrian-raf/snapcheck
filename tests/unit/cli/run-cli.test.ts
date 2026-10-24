import { describe, expect, it } from 'vitest';

import { ExitCode, UsageError, type CliIo } from '../../../src/cli/cli-io';
import { buildRunInvocation } from '../../../src/cli/commands/run';
import { formatTable } from '../../../src/cli/format-table';
import { runCli } from '../../../src/cli/run-cli';

const SHIPPED = ['bca', 'bri', 'default'];

/** Records everything the CLI asks the outside world to do. */
function fakeIo(env: NodeJS.ProcessEnv = {}) {
  const calls = {
    stdout: [] as string[],
    stderr: [] as string[],
    playwright: [] as { args: readonly string[]; env: Readonly<Record<string, string>> }[],
    mock: [] as Readonly<Record<string, string>>[],
    inbox: [] as Readonly<Record<string, string>>[],
  };
  const io: CliIo = {
    stdout: (text) => calls.stdout.push(text),
    stderr: (text) => calls.stderr.push(text),
    runPlaywright: (args, extraEnv) => {
      calls.playwright.push({ args, env: extraEnv });
      return Promise.resolve(ExitCode.ok);
    },
    startMock: (extraEnv) => {
      calls.mock.push(extraEnv);
      return Promise.resolve();
    },
    startInbox: (extraEnv) => {
      calls.inbox.push(extraEnv);
      return Promise.resolve();
    },
    loadEnvFile: () => undefined,
    env,
  };
  return { io, calls };
}

describe('buildRunInvocation', () => {
  it('runs every profile against its mock by default', () => {
    expect(buildRunInvocation({}, SHIPPED)).toEqual({ args: ['test'], env: {} });
  });

  it('selects one Playwright project for one profile', () => {
    expect(buildRunInvocation({ profile: 'bri', grep: '@standard' }, SHIPPED)).toEqual({
      args: ['test', '--project', 'bri', '--grep', '@standard'],
      env: { SNAPCHECK_PROFILES: 'bri' },
    });
  });

  it('targets a sandbox through environment variables, normalised to the origin', () => {
    expect(
      buildRunInvocation({ target: 'https://sandbox.example.co.id/', profile: 'bca' }, SHIPPED),
    ).toEqual({
      args: ['test'],
      env: { SNAP_BASE_URL: 'https://sandbox.example.co.id', SNAP_PROFILE: 'bca' },
    });
  });

  it('uses the default profile for a sandbox when none is given', () => {
    expect(buildRunInvocation({ target: 'https://x.co.id' }, SHIPPED).env.SNAP_PROFILE).toBe(
      'default',
    );
  });

  it.each([
    [{ profile: 'mandiri' }, /Unknown profile "mandiri". Available: bca, bri, default/],
    [{ profile: './my-bank.yaml' }, /only be used with --target/],
    [{ target: 'not a url' }, /must be a URL/],
    [{ target: 'ftp://x.co.id' }, /http or https/],
    [{ target: 'https://x.co.id/snap/v1.0' }, /origin only/],
    [{ target: 'https://x.co.id', profile: './missing.yaml' }, /Profile file not found/],
  ])('rejects %j', (options, message) => {
    expect(() => buildRunInvocation(options, SHIPPED)).toThrow(UsageError);
    expect(() => buildRunInvocation(options, SHIPPED)).toThrow(message);
  });
});

describe('runCli', () => {
  it('prints help and exits with the usage code when no command is given', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli([], io)).toBe(ExitCode.usage);
    expect(calls.stdout.join()).toContain('Usage: snapcheck <command>');
  });

  it('rejects an unknown command', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli(['deploy'], io)).toBe(ExitCode.usage);
    expect(calls.stderr.join()).toContain('Unknown command "deploy"');
  });

  it('prints command help without running anything', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli(['run', '--help'], io)).toBe(ExitCode.ok);
    expect(calls.stdout.join()).toContain('--target <url>');
    expect(calls.playwright).toEqual([]);
  });

  it('reports an unknown option as a usage error, with the command help', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli(['run', '--profiel', 'bri'], io)).toBe(ExitCode.usage);
    expect(calls.stderr.join()).toContain('snapcheck run [options]');
  });

  it('passes the Playwright exit code through', async () => {
    const { io, calls } = fakeIo();
    io.runPlaywright = () => Promise.resolve(ExitCode.testsFailed);
    expect(await runCli(['run'], io)).toBe(ExitCode.testsFailed);
    expect(calls.stderr).toEqual([]);
  });

  it('lets explicit flags win over SNAP_* environment variables', async () => {
    const { io, calls } = fakeIo({ SNAP_BASE_URL: 'https://env.co.id', SNAP_PROFILE: 'bca' });
    await runCli(['run', '--profile', 'bri'], io);
    expect(calls.playwright[0]?.env).toEqual({
      SNAP_BASE_URL: 'https://env.co.id',
      SNAP_PROFILE: 'bri',
    });
  });

  it('starts the mock with the requested profile and port', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli(['mock', '--profile', 'bca', '--port', '5000'], io)).toBe(ExitCode.ok);
    expect(calls.mock).toEqual([
      { MOCK_PROFILE: 'bca', MOCK_PORT: '5000', MOCK_HOST: '127.0.0.1' },
    ]);
  });

  it('falls back to MOCK_* environment variables, as used in the container', async () => {
    const { io, calls } = fakeIo({ MOCK_PROFILE: 'bri', MOCK_PORT: '4011', MOCK_HOST: '0.0.0.0' });
    await runCli(['mock'], io);
    expect(calls.mock).toEqual([{ MOCK_PROFILE: 'bri', MOCK_PORT: '4011', MOCK_HOST: '0.0.0.0' }]);
  });

  it.each([
    ['--port', 'abc'],
    ['--port', '70000'],
    ['--profile', 'mandiri'],
  ])('refuses to start the mock with %s %s', async (flag, value) => {
    const { io, calls } = fakeIo();
    expect(await runCli(['mock', flag, value], io)).toBe(ExitCode.usage);
    expect(calls.mock).toEqual([]);
  });

  it('starts the inbox, falling back to INBOX_* variables', async () => {
    const { io, calls } = fakeIo({ INBOX_HOST: '0.0.0.0' });
    expect(await runCli(['inbox', '--port', '4200'], io)).toBe(ExitCode.ok);
    expect(calls.inbox).toEqual([
      { INBOX_PORT: '4200', INBOX_HOST: '0.0.0.0', INBOX_PATH: '/snap/notify' },
    ]);
  });

  it('refuses an inbox path that does not start with a slash', async () => {
    const { io, calls } = fakeIo();
    expect(await runCli(['inbox', '--path', 'notify'], io)).toBe(ExitCode.usage);
    expect(calls.inbox).toEqual([]);
  });

  it('lists the shipped profiles', async () => {
    const { io, calls } = fakeIo();
    await runCli(['profiles'], io);
    expect(calls.stdout.join()).toMatch(/bri\s+BRI \(BRIAPI\)\s+UTC \+ms\s+exclude\s+BearerToken/);
  });

  it('filters requirements by basis', async () => {
    const { io, calls } = fakeIo();
    await runCli(['requirements', '--basis', 'mock-policy'], io);
    const output = calls.stdout.join('\n');
    expect(output).toContain('IDEM-003');
    expect(output).not.toContain('TOK-001');
    expect(output).toContain('NTF-001');
    expect(output).toContain('5 requirements');
  });
});

describe('formatTable', () => {
  it('pads columns to the widest cell', () => {
    expect(formatTable(['A', 'Long'], [['xyz', '1']])).toBe('A    Long\n---  ----\nxyz  1');
  });
});
