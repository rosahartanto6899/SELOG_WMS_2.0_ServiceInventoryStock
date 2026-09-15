import { BadRequestException } from '@/shared-libs/exceptions';
import axios from 'axios';

export class AzureAdThird {
  async me(token: string): Promise<any> {
    try {
      return await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      throw new BadRequestException('error graph microsoft ad request');
    }
  }
}
