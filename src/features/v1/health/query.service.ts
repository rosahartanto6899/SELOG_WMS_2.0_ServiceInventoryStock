import { injectable } from 'inversify';
import { databaseManager } from '@/utils';
import { awsSqsThird } from '@/integrations/thrid-party/aws-sqs.third';
import { RedisCache } from '@/integrations/thrid-party/redis.third';

/** Entri komponen healthcheck — parity respons /healthcheck-sql WMS_Incoming. */
export interface ComponentHealth {
  component: string;
  status: string;
  description: string | null;
  error: string | null;
}

@injectable()
export class QueryService {
  /** SQL Server — sequelize.authenticate() ≈ healthQuery "SELECT 1;". */
  async checkSql(): Promise<ComponentHealth> {
    try {
      const connected = await databaseManager.isSqlConnected();
      if (!connected) throw new Error('authenticate returned false');
      return { component: 'sqlserver', status: 'Healthy', description: null, error: null };
    } catch (error) {
      return {
        component: 'sqlserver',
        status: 'Unhealthy',
        description: 'Service Unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Redis — PING ≈ healthcheck connection. */
  async checkRedis(): Promise<ComponentHealth> {
    try {
      const pong = await RedisCache.getInstance().ping();
      if (pong !== 'PONG') throw new Error(`unexpected reply: ${pong}`);
      return { component: 'redis', status: 'Healthy', description: null, error: null };
    } catch (error) {
      return {
        component: 'redis',
        status: 'Unhealthy',
        description: 'Service Unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** SQS — GetQueueAttributes pada queue inventory stock. */
  async checkSqs(): Promise<ComponentHealth> {
    try {
      await awsSqsThird.checkHealth();
      return { component: 'sqs', status: 'Healthy', description: null, error: null };
    } catch (error) {
      return {
        component: 'sqs',
        status: 'Unhealthy',
        description: 'Service Unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
