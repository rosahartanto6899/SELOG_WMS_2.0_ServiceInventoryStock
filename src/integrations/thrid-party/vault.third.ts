import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

export class VaultClient {
  private readonly vaultClient: any = {};
  public env: { [key: string]: any } = {};
  private readonly _vaultUrl = process.env.VAULT_URL ?? '';

  async getSecret(): Promise<void> {
    try {
      if (process.env.IS_VAULT) {
        const result = await axios.post(
          `${this._vaultUrl}/v1/auth/approle/login`,
          {
            role_id: process.env.VAULT_ROLE,
            secret_id: process.env.VAULT_SECRET,
          }
        );

        this.vaultClient.token = result.data.auth.client_token;

        const response = await axios.get(
          `${this._vaultUrl}/${process.env.VAULT_PATH}`,
          {
            headers: {
              'X-Vault-Token': this.vaultClient.token,
            },
          }
        );

        this.env = response.data.data.data;

        const globalEnv = await axios.get(
          `${this._vaultUrl}/${process.env.VAULT_GLOBAL_PATH}`,
          {
            headers: {
              'X-Vault-Token': this.vaultClient.token,
            },
          }
        );
        const globalEnvData = globalEnv.data.data.data;
        this.env = { ...this.env, ...globalEnvData };
      } else {
        const envConfig = dotenv.parse(
          fs.readFileSync(path.resolve(process.cwd() + '/.env'))
        );
        for (const key in envConfig) {
          if (envConfig.hasOwnProperty(key)) {
            this.env[key] = process.env[key] ?? envConfig[key];
          }
        }
      }
    } catch (error) {
      console.error('Error fetching secret from Vault:', error);
      throw error;
    }
  }
}
