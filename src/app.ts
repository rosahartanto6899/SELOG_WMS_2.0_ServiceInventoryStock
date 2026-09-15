import 'dotenv/config';
import { default as SecretManager } from '@/shared-libs/utils/secret-manager.util';

async function initializeSecrets() {
  await SecretManager.getSecret(process.env.VAULT_PATH);
}

initializeSecrets()
  .then(() => {
    import('./server').then(({ Bootstrap }) => {
      Bootstrap();
    });
  })
  .catch((error) => {
    console.error('Error initializing secrets:', error);
  });
