import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  HeadObjectCommandOutput,
  CopyObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandOutput,
  CopyObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { default as SecretManager } from '@/shared-libs/utils/secret-manager.util';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * AWS S3 Client with enhanced error handling, retry logic, and logging
 *
 * Features:
 * - Singleton pattern for connection reuse
 * - Automatic retry for transient failures (via AWS SDK maxAttempts)
 * - User-friendly error messages
 * - Structured logging for monitoring
 * - Connection lifecycle management
 *
 * @example
 * const s3Client = new AwsS3Client();
 * await s3Client.uploadFile('my-bucket', 'file.pdf', buffer);
 */
export class AwsS3Client {
  private static s3Client: S3Client;
  private static readonly DEFAULT_RETRY_ATTEMPTS = 3;

  /**
   * Get or create S3 Client instance (singleton)
   *
   * Implements connection pooling through AWS SDK's built-in connection management.
   * The SDK maintains a pool of HTTP connections that are reused across requests.
   *
   * @returns {S3Client} Configured S3 client instance
   * @throws {Error} If AWS credentials are not configured
   *
   * @example
   * const client = AwsS3Client.getInstance();
   */
  public static getInstance(): S3Client {
    const region = SecretManager.env.AWS_REGION || 'ap-southeast-1';
    const accessKeyId = SecretManager.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = SecretManager.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      const error = new Error(
        'AWS S3 configuration is incomplete. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.',
      );
      console.error('[AwsS3Client] Configuration error:', {
        region,
        hasAccessKeyId: !!accessKeyId,
        hasSecretAccessKey: !!secretAccessKey,
      });
      throw error;
    }

    if (!AwsS3Client.s3Client) {
      console.log('[AwsS3Client] Initializing new S3 client', {
        region,
        timestamp: new Date().toISOString(),
      });

      AwsS3Client.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        // Enable retry with exponential backoff
        maxAttempts: AwsS3Client.DEFAULT_RETRY_ATTEMPTS,
        // Connection pooling configuration
        requestHandler: {
          connectionTimeout: 30000, // 30 seconds
          socketTimeout: 30000,
        },
      });
    }

    return AwsS3Client.s3Client;
  }

  /**
   * Gracefully destroy the S3 client connection
   * Useful for cleanup in tests or application shutdown
   *
   * @example
   * // On application shutdown
   * AwsS3Client.destroy();
   */
  public static destroy(): void {
    if (AwsS3Client.s3Client) {
      console.log('[AwsS3Client] Destroying S3 client connection');
      AwsS3Client.s3Client.destroy();
      AwsS3Client.s3Client = null as any;
    }
  }

  /**
   * Upload a file to S3
   *
   * Automatically retries on transient failures (network issues, throttling)
   *
   * @param bucket - S3 bucket name
   * @param key - File path/key in S3
   * @param file - File content as Buffer
   * @param options - Additional S3 upload options (ContentType, Metadata, etc.)
   * @returns Upload result from S3
   * @throws {Error} User-friendly error message if upload fails
   *
   * @example
   * await s3Client.uploadFile(
   *   'my-bucket',
   *   'uploads/file.pdf',
   *   fileBuffer,
   *   { ContentType: 'application/pdf' }
   * );
   */
  async uploadFile(
    bucket: string,
    key: string,
    file: Buffer,
    options?: Partial<PutObjectCommandInput>,
  ): Promise<any> {
    const startTime = Date.now();
    const s3Client = AwsS3Client.getInstance();

    try {
      console.log('[AwsS3Client] Uploading file', {
        bucket,
        key,
        sizeBytes: file.length,
        contentType: options?.ContentType,
      });

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ...options,
      });

      const result = await s3Client.send(command);

      const duration = Date.now() - startTime;
      console.log('[AwsS3Client] Upload successful', {
        bucket,
        key,
        durationMs: duration,
        etag: result.ETag,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[AwsS3Client] Upload failed', {
        bucket,
        key,
        durationMs: duration,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(error, `Failed to upload file to S3: ${key}`);
    }
  }

  /**
   * Copy a file within S3 (server-side copy, no download/upload)
   *
   * This is much more efficient than downloading and re-uploading.
   * The copy happens entirely within S3's servers.
   *
   * @param bucket - S3 bucket name
   * @param sourceKey - Source file path/key in S3
   * @param destinationKey - Destination file path/key in S3
   * @param options - Additional S3 copy options (StorageClass, Metadata, etc.)
   * @returns Copy result from S3
   * @throws {Error} User-friendly error message if copy fails
   *
   * @example
   * await s3Client.copyObject(
   *   'my-bucket',
   *   'temp/file.pdf',
   *   'final/file.pdf',
   *   {
   *     StorageClass: 'INTELLIGENT_TIERING',
   *     Metadata: { 'contract-no': 'ABC123' },
   *     MetadataDirective: 'REPLACE'
   *   }
   * );
   */
  async copyObject(
    bucket: string,
    sourceKey: string,
    destinationKey: string,
    options?: Partial<CopyObjectCommandInput>,
  ): Promise<any> {
    const startTime = Date.now();
    const s3Client = AwsS3Client.getInstance();

    try {
      console.log('[AwsS3Client] Copying file (server-side)', {
        bucket,
        sourceKey,
        destinationKey,
        storageClass: options?.StorageClass,
      });

      const command = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${sourceKey}`,
        Key: destinationKey,
        ...options,
      });

      const result = await s3Client.send(command);

      const duration = Date.now() - startTime;
      console.log('[AwsS3Client] Copy successful', {
        bucket,
        sourceKey,
        destinationKey,
        durationMs: duration,
        etag: result.CopyObjectResult?.ETag,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[AwsS3Client] Copy failed', {
        bucket,
        sourceKey,
        destinationKey,
        durationMs: duration,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(
        error,
        `Failed to copy file in S3: ${sourceKey} -> ${destinationKey}`,
      );
    }
  }

  /**
   * Delete a file from S3
   *
   * @param bucket - S3 bucket name
   * @param key - File path/key in S3
   * @throws {Error} User-friendly error message if deletion fails
   *
   * @example
   * await s3Client.deleteFile('my-bucket', 'uploads/file.pdf');
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    const startTime = Date.now();
    const s3Client = AwsS3Client.getInstance();

    try {
      console.log('[AwsS3Client] Deleting file', { bucket, key });

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await s3Client.send(command);

      const duration = Date.now() - startTime;
      console.log('[AwsS3Client] Delete successful', {
        bucket,
        key,
        durationMs: duration,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[AwsS3Client] Delete failed', {
        bucket,
        key,
        durationMs: duration,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(error, `Failed to delete file from S3: ${key}`);
    }
  }

  /**
   * Check if a file exists in S3
   *
   * @param bucket - S3 bucket name
   * @param key - File path/key in S3
   * @returns true if file exists, false if not found
   * @throws {Error} User-friendly error message if check fails (not including NotFound)
   *
   * @example
   * const exists = await s3Client.fileExists('my-bucket', 'uploads/file.pdf');
   * if (exists) { ... }
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    const s3Client = AwsS3Client.getInstance();

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await s3Client.send(command);
      console.log('[AwsS3Client] File exists', { bucket, key });
      return true;
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        console.log('[AwsS3Client] File does not exist', { bucket, key });
        return false;
      }

      console.error('[AwsS3Client] File existence check failed', {
        bucket,
        key,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(
        error,
        `Failed to check if file exists in S3: ${key}`,
      );
    }
  }

  /**
   * Get object metadata (ContentType, ContentDisposition, etc.) from S3
   *
   * Uses HeadObject to avoid downloading the file.
   */
  async getObjectMetadata(
    bucket: string,
    key: string,
  ): Promise<{
    ContentType?: string;
    ContentDisposition?: string;
    ContentEncoding?: string;
    Metadata?: Record<string, string>;
    ContentLength?: number;
    ETag?: string;
    LastModified?: Date;
  }> {
    const s3Client = AwsS3Client.getInstance();

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const result: HeadObjectCommandOutput = await s3Client.send(command);

      console.log('[AwsS3Client] Retrieved object metadata', {
        bucket,
        key,
        contentType: result.ContentType,
        contentDisposition: result.ContentDisposition,
      });

      return {
        ContentType: result.ContentType,
        ContentDisposition: result.ContentDisposition,
        ContentEncoding: result.ContentEncoding,
        Metadata: result.Metadata || undefined,
        ContentLength: result.ContentLength,
        ETag: result.ETag,
        LastModified: result.LastModified,
      };
    } catch (error: any) {
      console.error('[AwsS3Client] Get metadata failed', {
        bucket,
        key,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(
        error,
        `Failed to get object metadata from S3: ${key}`,
      );
    }
  }

  /**
   * Download a file from S3
   *
   * @param bucket - S3 bucket name
   * @param key - File path/key in S3
   * @returns S3 GetObject response with file stream
   * @throws {Error} User-friendly error message if download fails
   *
   * @example
   * const response = await s3Client.downloadFile('my-bucket', 'uploads/file.pdf');
   * const stream = response.Body;
   */
  async downloadFile(
    bucket: string,
    key: string,
  ): Promise<GetObjectCommandOutput> {
    const startTime = Date.now();
    const s3Client = AwsS3Client.getInstance();

    try {
      console.log('[AwsS3Client] Downloading file', { bucket, key });

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const result = await s3Client.send(command);

      const duration = Date.now() - startTime;
      console.log('[AwsS3Client] Download successful', {
        bucket,
        key,
        durationMs: duration,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[AwsS3Client] Download failed', {
        bucket,
        key,
        durationMs: duration,
        error: error.message,
        errorCode: error.Code || error.name,
      });

      throw this.handleS3Error(
        error,
        `Failed to download file from S3: ${key}`,
      );
    }
  }

  /**
   * Download a file from S3 and convert to Buffer
   *
   * Convenient method that downloads and converts stream to Buffer in one call
   *
   * @param bucket - S3 bucket name
   * @param key - File path/key in S3
   * @returns File content as Buffer
   * @throws {Error} User-friendly error message if download/conversion fails
   *
   * @example
   * const buffer = await s3Client.getFileBuffer('my-bucket', 'uploads/file.pdf');
   * console.log(buffer.length); // File size in bytes
   */
  async getFileBuffer(bucket: string, key: string): Promise<Buffer> {
    try {
      const response = await this.downloadFile(bucket, key);

      if (!response.Body) {
        throw new Error('File downloaded but response body is empty');
      }

      // Convert stream to buffer with better error handling
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);

          // Validate buffer is not empty
          if (buffer.length === 0) {
            console.warn('[AwsS3Client] Downloaded buffer is empty', {
              bucket,
              key,
              expectedLength: response.ContentLength,
            });
          }

          console.log('[AwsS3Client] Converted file to buffer', {
            bucket,
            key,
            bufferSize: buffer.length,
            expectedSize: response.ContentLength,
          });

          resolve(buffer);
        });

        stream.on('error', (error) => {
          console.error('[AwsS3Client] Stream error during buffer conversion', {
            bucket,
            key,
            error: error.message,
          });
          reject(new Error(`Stream error: ${error.message}`));
        });
      });
    } catch (error: any) {
      console.error('[AwsS3Client] Get file buffer failed', {
        bucket,
        key,
        error: error.message,
      });

      if (error.message && error.message.includes('S3')) {
        throw error; // Already handled by downloadFile
      }

      throw new Error(`Failed to convert file to buffer: ${error.message}`);
    }
  }

  /**
   * Handle S3 errors and convert to user-friendly messages
   *
   * @private
   * @param error - Original S3 error
   * @param context - Context message for the error
   * @returns User-friendly error
   */
  private handleS3Error(error: any, context: string): Error {
    const errorCode = error.Code || error.name || 'Unknown';
    const errorMessage = error.message || 'Unknown error occurred';

    // Map common S3 errors to user-friendly messages
    const errorMap: Record<string, string> = {
      NoSuchBucket: 'The specified S3 bucket does not exist',
      NoSuchKey: 'The specified file does not exist in S3',
      AccessDenied: 'Access denied. Please check S3 bucket permissions',
      InvalidAccessKeyId:
        'Invalid AWS credentials. Please check your access key',
      SignatureDoesNotMatch: 'AWS credentials are invalid or expired',
      RequestTimeout: 'Request to S3 timed out. Please try again',
      ServiceUnavailable:
        'S3 service is temporarily unavailable. Please try again',
      SlowDown: 'Too many requests to S3. Please slow down',
      TooManyRequests: 'Rate limit exceeded. Please try again later',
      NetworkingError:
        'Network connection error. Please check your internet connection',
    };

    const userMessage =
      errorMap[errorCode] || `S3 operation failed: ${errorMessage}`;
    const fullMessage = `${context}. ${userMessage}`;

    const enhancedError = new Error(fullMessage);
    (enhancedError as any).originalError = error;
    (enhancedError as any).errorCode = errorCode;
    (enhancedError as any).isRetryable = this.isRetryableError(errorCode);

    return enhancedError;
  }

  /**
   * Determine if an error is retryable
   *
   * @private
   * @param errorCode - S3 error code
   * @returns true if error is transient and should be retried
   */
  private isRetryableError(errorCode: string): boolean {
    const retryableErrors = [
      'RequestTimeout',
      'ServiceUnavailable',
      'SlowDown',
      'TooManyRequests',
      'NetworkingError',
      'RequestTimeTooSkewed',
      'InternalError',
    ];

    return retryableErrors.includes(errorCode);
  }

  async getPresignedUrl(
    s3UrlOrPath: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      let bucket: string;
      let key: string;

      // Check if it's a full URL or just a path
      if (
        s3UrlOrPath.startsWith('http://') ||
        s3UrlOrPath.startsWith('https://')
      ) {
        // Parse full S3 URL
        const url = new URL(s3UrlOrPath);
        const pathParts = url.hostname.split('.');
        bucket = pathParts[0]; // Extract bucket from hostname
        // Decode the URL-encoded pathname to get the actual key
        key = decodeURIComponent(url.pathname.substring(1));
      } else {
        // Parse bucket/key path format
        const firstSlashIndex = s3UrlOrPath.indexOf('/');
        if (firstSlashIndex === -1) {
          throw new Error('Invalid S3 path format. Expected: bucket/key/path');
        }
        bucket = s3UrlOrPath.substring(0, firstSlashIndex);
        key = s3UrlOrPath.substring(firstSlashIndex + 1);
      }

      const s3Client = AwsS3Client.getInstance();

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      return presignedUrl;
    } catch (error: any) {
      throw new Error(`Failed to generate presigned URL`);
    }
  }
}
