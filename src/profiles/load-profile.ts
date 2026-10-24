import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ProviderProfileSchema, type ProviderProfile } from './profile-schema';

export const PROFILES_DIR = 'profiles';
export const DEFAULT_PROFILE = 'default';

const PROFILE_EXTENSION = '.yaml';

export class ProfileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProfileError';
  }
}

/**
 * Loads a profile by name (`bri` → `profiles/bri.yaml`) or by file path
 * (`./my-bank.yaml`), validates it, and checks that `name` matches the file name.
 */
export function loadProfile(
  nameOrPath: string,
  profilesDir: string = PROFILES_DIR,
): ProviderProfile {
  const file = isFilePath(nameOrPath)
    ? nameOrPath
    : join(profilesDir, `${nameOrPath}${PROFILE_EXTENSION}`);

  const parsed = ProviderProfileSchema.safeParse(readYaml(file));
  if (!parsed.success) {
    throw new ProfileError(`Invalid profile "${file}":\n${z.prettifyError(parsed.error)}`);
  }

  const expectedName = basename(file, extname(file));
  if (parsed.data.name !== expectedName) {
    throw new ProfileError(
      `Profile "${file}" declares name "${parsed.data.name}"; expected "${expectedName}".`,
    );
  }
  return parsed.data;
}

/** Names of every profile shipped in `profilesDir`, sorted. */
export function listProfiles(profilesDir: string = PROFILES_DIR): string[] {
  return readdirSync(profilesDir)
    .filter((file) => file.endsWith(PROFILE_EXTENSION))
    .map((file) => basename(file, PROFILE_EXTENSION))
    .sort();
}

function isFilePath(value: string): boolean {
  return value.includes('/') || value.includes('\\') || /\.ya?ml$/.test(value);
}

function readYaml(file: string): unknown {
  try {
    return parseYaml(readFileSync(file, 'utf8')) as unknown;
  } catch (cause) {
    throw new ProfileError(`Cannot read profile "${file}".`, { cause });
  }
}
