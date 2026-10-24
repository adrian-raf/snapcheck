import { parseArgs } from 'node:util';

import { listProfiles, loadProfile } from '../../profiles';
import { REQUIREMENTS, REQUIREMENT_IDS, type RequirementBasis } from '../../requirements';
import { ExitCode, UsageError, type CliIo } from '../cli-io';
import { formatTable } from '../format-table';

export const PROFILES_HELP = `snapcheck profiles

Lists the provider profiles in profiles/ and how they differ.`;

export const REQUIREMENTS_HELP = `snapcheck requirements [--basis <basis>]

Lists the requirement catalogue.

Options:
  --basis <basis>  Only standard, provider-variant, mock-policy or resilience requirements`;

const BASES: readonly RequirementBasis[] = [
  'standard',
  'provider-variant',
  'mock-policy',
  'resilience',
];

export function profilesCommand(argv: readonly string[], io: CliIo): number {
  parseArgs({ args: [...argv], options: {}, strict: true });

  const rows = listProfiles().map((name) => {
    const profile = loadProfile(name);
    return [
      profile.name,
      profile.displayName,
      `${profile.timestamp.timezone}${profile.timestamp.milliseconds ? ' +ms' : ''}`,
      profile.signature.queryString,
      profile.accessToken.tokenType,
      String(profile.unverified.length),
    ];
  });

  io.stdout(
    formatTable(['Name', 'Provider', 'Timestamp', 'Query string', 'tokenType', 'Unverified'], rows),
  );
  return ExitCode.ok;
}

export function requirementsCommand(argv: readonly string[], io: CliIo): number {
  const { values } = parseArgs({
    args: [...argv],
    options: { basis: { type: 'string' } },
    strict: true,
  });

  const basis = values.basis;
  if (basis !== undefined && !BASES.includes(basis as RequirementBasis)) {
    throw new UsageError(`--basis must be one of ${BASES.join(', ')} (got "${basis}")`);
  }

  const rows = REQUIREMENT_IDS.filter(
    (id) => basis === undefined || REQUIREMENTS[id].basis === basis,
  ).map((id) => [id, REQUIREMENTS[id].basis, REQUIREMENTS[id].title]);

  io.stdout(formatTable(['ID', 'Basis', 'Requirement'], rows));
  io.stdout(`\n${rows.length} requirement${rows.length === 1 ? '' : 's'}`);
  return ExitCode.ok;
}
