import SecretManager from '@/shared-libs/utils/secret-manager.util';
import { Sequelize, DataTypes } from 'sequelize';
import moment from 'moment';
import { createConnection, Connection } from 'mongoose';
import crypto from 'node:crypto';

// Fix Sequelize mssql: DATE._stringify default memakai format "YYYY-MM-DD HH:mm:ss.SSS Z"
// (ber-suffix offset, mis. "+00:00") yang TIDAK bisa diparse kolom DATETIME SQL Server
// ("Conversion failed when converting date and/or time from character string").
// Tanpa suffix Z, string dikonversi implisit oleh SQL Server; nilai diformat sesuai
// `timezone: '+07:00'` di config Sequelize di bawah (= WIB, paritas DATEADD(HOUR,7,...) legacy).
// patch prototype global, semua model kena; hapus jika Sequelize memperbaiki #10818.
(DataTypes.DATE.prototype as any)._stringify = function (date: Date, options: any) {
  const m = moment.isMoment(date) ? date : (this as any)._applyTimezone(date, options);
  return m.format('YYYY-MM-DD HH:mm:ss.SSS');
};

// Connection state types
type ConnectionState =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting';

// Configuration constants
const RECONNECT_DELAY = 5000; // 5 seconds

export const sequelize: Sequelize = new Sequelize(
  `${SecretManager.env.SQL_DATABASE_INVENTORYSTOCK}`,
  `${SecretManager.env.SQL_USERNAME_INVENTORYSTOCK}`,
  `${SecretManager.env.SQL_PASSWORD_INVENTORYSTOCK}`,
  {
    host: `${SecretManager.env.SQL_HOST}`,
    dialect: 'mssql',
    timezone: '+07:00',
    pool: {
      max: Number.parseInt(process.env.SQL_POOL_MAX || '200', 10),
      min: Number.parseInt(process.env.SQL_POOL_MIN || '0', 10),
      idle: Number.parseInt(process.env.SQL_POOL_IDLE || '10000', 10),
      acquire: Number.parseInt(process.env.SQL_POOL_ACQUIRE || '30000', 10),
    },
    logging: process.env.SQL_LOGGING === 'true' ? console.log : false,
  }
);

const options = {
  minPoolSize: Number.parseInt(process.env.MONGO_POOL_MIN || '10', 10),
  maxPoolSize: Number.parseInt(process.env.MONGO_POOL_MAX || '100', 10),
  serverSelectionTimeoutMS: Number.parseInt(
    process.env.MONGO_SERVER_TIMEOUT || '10000',
    10
  ),
  socketTimeoutMS: Number.parseInt(
    process.env.MONGO_SOCKET_TIMEOUT || '45000',
    10
  ),
  retryWrites: true,
  retryReads: true,
};

let reconnectAttempts = 0;
let isReconnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const uriDashboard = `${SecretManager.env.MONGODB_CONNECTION_STRING}`;
// console.log(uriDashboard);

const dbMongo: Connection = createConnection();

// Calculate delay with jitter
const getReconnectDelay = (): number => {
  // Add jitter (±20%) using cryptographically secure random
  const randomValue = crypto.randomInt(0, 10001) / 10000; // 0.0000 to 1.0000
  const jitter = RECONNECT_DELAY * 0.2 * (randomValue - 0.5);
  return Math.floor(RECONNECT_DELAY + jitter);
};

const attemptReconnect = async () => {
  // Don't reconnect if shutting down
  if (isShuttingDown) {
    console.log('Application shutting down, skipping reconnect');
    return;
  }

  if (isReconnecting) {
    console.log('Reconnection already in progress, skipping...');
    return;
  }

  // Check if already connected
  if (dbMongo.readyState === 1) {
    console.log('Already connected, skipping reconnect');
    reconnectAttempts = 0;
    return;
  }

  // Clear previous timer if exists
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  isReconnecting = true;
  reconnectAttempts++;

  const delay = getReconnectDelay();
  console.log(
    `MongoDB disconnected. Retrying connection in ${delay}ms... (attempt ${reconnectAttempts})`
  );

  reconnectTimer = setTimeout(async () => {
    try {
      // Verify state hasn't changed during timeout
      if (dbMongo.readyState === 0 && !isShuttingDown) {
        console.log(`Attempting MongoDB reconnection ${reconnectAttempts}...`);
        await dbMongo.openUri(uriDashboard, options);
        console.log('MongoDB reconnection successful');
      } else {
        console.log(
          `Connection state is ${getConnectionState(
            dbMongo.readyState
          )}, skipping reconnect`
        );
        isReconnecting = false;
      }
    } catch (error) {
      console.error(
        `MongoDB reconnection attempt ${reconnectAttempts} failed:`,
        error instanceof Error ? error.message : error
      );
      isReconnecting = false;
      // Retry with exponential backoff
      attemptReconnect();
    } finally {
      // Reset flag if successfully connected or connecting
      if (dbMongo.readyState === 1 || dbMongo.readyState === 2) {
        isReconnecting = false;
      }
      reconnectTimer = null;
    }
  }, delay);
};

const getConnectionState = (state: number): ConnectionState => {
  const states: ConnectionState[] = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting',
  ];
  return states[state] || 'disconnected';
};

let listenersSetup = false;

const setupEventListeners = () => {
  if (listenersSetup) {
    console.log('MongoDB event listeners already setup, skipping...');
    return;
  }

  // Remove all existing listeners to prevent duplicates
  dbMongo.removeAllListeners();

  dbMongo.on('error', (err) => {
    console.error(
      'MongoDB connection error:',
      err instanceof Error ? err.message : err
    );
  });

  dbMongo.on('connected', () => {
    console.log('MongoDB connected successfully');
    reconnectAttempts = 0;
    isReconnecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  // Using 'close' event as it's more reliable than 'disconnected'
  // for detecting actual connection loss
  dbMongo.on('close', () => {
    console.log('MongoDB connection closed');
    // Only attempt reconnect if not shutting down and truly disconnected
    if (!isShuttingDown && dbMongo.readyState === 0) {
      attemptReconnect();
    }
  });

  dbMongo.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
    reconnectAttempts = 0;
    isReconnecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  dbMongo.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  listenersSetup = true;
};

// Setup event listeners once at module load
setupEventListeners();

const connectMongoDBDashboard = async (): Promise<void> => {
  if (dbMongo.readyState === 0) {
    await dbMongo.openUri(uriDashboard, options);
    console.log('Initial MongoDB connection established');
  } else {
    console.log(
      `MongoDB already in state: ${getConnectionState(dbMongo.readyState)}`
    );
  }
};

const connectSequelize = async (): Promise<void> => {
  await sequelize.authenticate();
  console.log('SQL Server connection established successfully');
};

class DatabaseManager {
  /**
   * Initialize all database connections (MongoDB and SQL Server)
   */
  public async connect(): Promise<void> {
    const errors: Error[] = [];

    // Connect to MongoDB
    // kill-switch via MONGO_DISABLED=true, hapus jika mongo wajib lagi
    try {
      if (process.env.MONGO_DISABLED === 'true') {
        console.log('MongoDB disabled (MONGO_DISABLED=true), skipping connection');
      } else {
        await connectMongoDBDashboard();
      }
    } catch (error) {
      const mongoError = new Error(
        `MongoDB connection failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      console.error(mongoError.message);
      errors.push(mongoError);
    }

    // Connect to SQL Server
    try {
      await connectSequelize();
    } catch (error) {
      const sqlError = new Error(
        `SQL Server connection failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      console.error(sqlError.message);
      errors.push(sqlError);
    }

    if (errors.length > 0) {
      throw new Error(
        `Database connection errors: ${errors.map((e) => e.message).join('; ')}`
      );
    }
  }

  /**
   * Gracefully close all database connections
   */
  public async disconnect(): Promise<void> {
    isShuttingDown = true;
    console.log('Closing database connections...');

    // Clear reconnection timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const closePromises: Promise<void>[] = [];

    // Close MongoDB
    if (dbMongo.readyState !== 0) {
      closePromises.push(
        dbMongo.close().then(() => {
          console.log('MongoDB connection closed');
        })
      );
    }

    // Close Sequelize
    closePromises.push(
      sequelize.close().then(() => {
        console.log('SQL Server connection closed');
      })
    );

    await Promise.all(closePromises);
    console.log('All database connections closed');
  }

  /**
   * Check if MongoDB is connected
   */
  public isMongoConnected(): boolean {
    return dbMongo.readyState === 1;
  }

  /**
   * Check if SQL Server is connected
   */
  public async isSqlConnected(): Promise<boolean> {
    try {
      await sequelize.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get MongoDB connection state
   */
  public getMongoState(): ConnectionState {
    return getConnectionState(dbMongo.readyState);
  }

  /**
   * Get health status of all connections
   */
  public async getHealthStatus(): Promise<{
    mongodb: { connected: boolean; state: ConnectionState };
    sqlServer: { connected: boolean };
    reconnectionAttempts: number;
  }> {
    return {
      mongodb: {
        connected: this.isMongoConnected(),
        state: this.getMongoState(),
      },
      sqlServer: {
        connected: await this.isSqlConnected(),
      },
      reconnectionAttempts: reconnectAttempts,
    };
  }

  /**
   * Reset reconnection state (useful for testing or manual intervention)
   */
  public resetReconnection(): void {
    reconnectAttempts = 0;
    isReconnecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    console.log('Reconnection state reset');
  }

  /**
   * Force reconnection attempt (use with caution)
   */
  public forceReconnect(): void {
    if (!isShuttingDown && dbMongo.readyState === 0) {
      console.log('Forcing reconnection attempt...');
      this.resetReconnection();
      attemptReconnect();
    } else {
      console.log(
        `Cannot force reconnect. Shutting down: ${isShuttingDown}, State: ${this.getMongoState()}`
      );
    }
  }
}

export const databaseManager = new DatabaseManager();

// Legacy export for backward compatibility
export const sequelizer = databaseManager;

export { dbMongo };
