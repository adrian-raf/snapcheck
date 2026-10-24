#!/usr/bin/env node
// Registers the TypeScript loader, then runs the CLI from source (no build step).
import { register } from 'tsx/esm/api';

register();
await import('../src/cli/main.ts');
