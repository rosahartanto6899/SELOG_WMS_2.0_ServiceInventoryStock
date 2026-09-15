// blob storage
// AWS S3 Storage
import {
  GetObjectCommandOutput,
  PutObjectCommandInput,
  CopyObjectCommandInput,
} from '@aws-sdk/client-s3';
import { AwsS3Client } from '@/integrations/thrid-party/aws-s3.third';
import {
  BlobServiceClient,
  PublicAccessType,
} from '@azure/storage-blob';
import { randomUUID } from 'node:crypto';

/**
 * Parity CoreApp `StorageService.MediaToBlob` — upload buffer ke Azure Blob,
 * nama blob `{folderName}/{guid}{extension}`, container dibuat jika belum ada
 * (akses public blob). Config: BLOB_CONNECTION + BLOB_CONTAINER_NAME
 * (nilai disalin dari appsettings CoreApp).
 */
export async function mediaToBlob(
  content: Buffer,
  containerName: string,
  folderName: string,
  extension: string,
): Promise<string> {
  const client = new BlobServiceClient(process.env.BLOB_CONNECTION ?? '');
  const container = client.getContainerClient(containerName);
  await container.createIfNotExists({ access: 'blob' as PublicAccessType });
  const blockBlob = container.getBlockBlobClient(
    `${folderName}/${randomUUID()}${extension}`,
  );
  await blockBlob.upload(content, content.byteLength);
  return blockBlob.url;
}


class S3Storage {
  private static instance: S3Storage;
  private readonly s3Client: AwsS3Client;

  private constructor() {
    this.s3Client = new AwsS3Client();
  }

  public static getInstance(): S3Storage {
    if (!S3Storage.instance) {
      S3Storage.instance = new S3Storage();
    }
    return S3Storage.instance;
  }

  /**
   * Upload file to S3 bucket
   * @param bucketName - S3 bucket name (equivalent to Azure container)
   * @param fileName - File key/path in S3
   * @param file - File buffer
   * @param options - Additional S3 options (ContentType, Metadata, etc.)
   */
  public async uploadFile(
    bucketName: string,
    fileName: string,
    file: Buffer,
    options?: Partial<PutObjectCommandInput>
  ): Promise<any> {
    return await this.s3Client.uploadFile(bucketName, fileName, file, options);
  }

  /**
   * Copy file within S3 (server-side copy, no download/upload)
   * Much more efficient than downloading and re-uploading
   * @param bucketName - S3 bucket name
   * @param sourceKey - Source file key/path in S3
   * @param destinationKey - Destination file key/path in S3
   * @param options - Additional S3 copy options (StorageClass, Metadata, etc.)
   */
  public async copyObject(
    bucketName: string,
    sourceKey: string,
    destinationKey: string,
    options?: Partial<CopyObjectCommandInput>
  ): Promise<any> {
    return await this.s3Client.copyObject(
      bucketName,
      sourceKey,
      destinationKey,
      options
    );
  }

  /**
   * Delete file from S3
   * @param fileName - Full path format: bucket/folder/file.ext
   */
  public async deleteFile(fileName: string): Promise<void> {
    const { bucket, key } = this.parseS3Path(fileName);
    await this.s3Client.deleteFile(bucket, key);
  }

  /**
   * Check if file exists in S3
   * @param fileName - Full path format: bucket/folder/file.ext
   */
  public async getBlobExist(fileName: string): Promise<boolean> {
    const { bucket, key } = this.parseS3Path(fileName);
    return await this.s3Client.fileExists(bucket, key);
  }

  /**
   * Download file from S3
   * @param fileName - Full path format: bucket/folder/file.ext
   */
  public async downloadBlob(fileName: string): Promise<GetObjectCommandOutput> {
    const { bucket, key } = this.parseS3Path(fileName);
    return await this.s3Client.downloadFile(bucket, key);
  }

  /**
   * Download file from S3 by bucket and key
   * @param bucketName - S3 bucket name
   * @param key - File key/path in S3
   */
  public async downloadBlobByNameAndContainer(
    bucketName: string,
    key: string
  ): Promise<GetObjectCommandOutput> {
    return await this.s3Client.downloadFile(bucketName, key);
  }

  /**
   * Check if file exists by bucket and key
   */
  public async fileExists(bucketName: string, key: string): Promise<boolean> {
    return await this.s3Client.fileExists(bucketName, key);
  }

  /**
   * Get object metadata (ContentType, ContentDisposition, etc.)
   */
  public async getObjectMetadata(
    bucketName: string,
    key: string
  ): Promise<{
    ContentType?: string;
    ContentDisposition?: string;
    ContentEncoding?: string;
    Metadata?: Record<string, string>;
    ContentLength?: number;
    ETag?: string;
    LastModified?: Date;
  }> {
    return await this.s3Client.getObjectMetadata(bucketName, key);
  }

  /**
   * Download file as Buffer
   * @param bucketName - S3 bucket name
   * @param key - File key/path in S3
   */
  public async downloadBlobAsBuffer(
    bucketName: string,
    key: string
  ): Promise<Buffer> {
    return await this.s3Client.getFileBuffer(bucketName, key);
  }

  /**
   * Parse S3 path format: bucket/folder/file.ext
   * Returns { bucket, key }
   */
  private parseS3Path(fileName: string): { bucket: string; key: string } {
    const parts = fileName.split('/');
    if (parts.length < 2) {
      throw new Error(
        'Invalid S3 path format. Expected: bucket/folder/file.ext'
      );
    }

    const bucket = parts[0];
    const key = parts.slice(1).join('/');

    return { bucket, key };
  }
}

export const s3Storage = S3Storage.getInstance();

// Export for backward compatibility
export const blobStorage = s3Storage;
