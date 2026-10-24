/** `npm run keys:ensure` — see src/keys/ensure-local-key-pair.ts. */
import { LOCAL_KEY_PATHS, LOCAL_PROVIDER_KEY_PATHS } from '../src/config/local-defaults';
import { ensureLocalKeyPairs, type KeyPairStatus } from '../src/keys/ensure-local-key-pair';

const MESSAGES: Record<KeyPairStatus, string> = {
  existing: 'already present',
  generated: 'generated',
  'generated-concurrently': 'created concurrently',
};

const status = ensureLocalKeyPairs();
console.info(`Partner key pair ${MESSAGES[status.partner]}: ${LOCAL_KEY_PATHS.privateKey}`);
console.info(
  `Provider key pair ${MESSAGES[status.provider]}: ${LOCAL_PROVIDER_KEY_PATHS.privateKey}`,
);
