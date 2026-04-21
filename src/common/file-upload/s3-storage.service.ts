import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

@Injectable()
export class S3StorageService {
    private readonly logger = new Logger(S3StorageService.name);
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly publicUrl: string;

    constructor(private readonly configService: ConfigService) {
        // Expected to be provided in environment variables or hardcoded per user request
        const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
        const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');

        // For cloudflare R2, Region is usually 'auto'
        const region = this.configService.get<string>('R2_REGION', 'auto');

        this.bucketName = this.configService.get<string>('R2_BUCKET_NAME', 'edulama');

        // Cloudflare R2 Public Serving URL
        const publicUrlEnv = this.configService.get<string>('R2_PUBLIC_URL');
        this.publicUrl = publicUrlEnv ? publicUrlEnv : `https://pub-1a36ceec756f4ac9aa7a0bbef5f43bae.r2.dev`;

        if (!accountId || !accessKeyId || !secretAccessKey) {
            this.logger.warn('S3 credentials not fully configured in environment variables.');
        }

        this.s3Client = new S3Client({
            region,
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: accessKeyId || '',
                secretAccessKey: secretAccessKey || '',
            },
        });
    }

    /**
     * Lists objects in a bucket with a specific prefix
     */
    async listObjects(prefix: string) {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
            });

            const data = await this.s3Client.send(command);
            
            return (data.Contents || []).map((item) => {
                const filename = item.Key ? item.Key.replace(prefix, "") : "unknown";
                // Filter out the directory itself if it appears
                if (!filename) return null;

                return {
                    name: filename,
                    key: item.Key,
                    url: `${this.publicUrl}/${item.Key}`,
                    size: item.Size || 0,
                    createdAt: item.LastModified || new Date(),
                    type: path.extname(filename).replace(".", "")
                };
            }).filter(Boolean);
        } catch (error) {
            this.logger.error(`Failed to list objects from R2: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to list files from cloud storage');
        }
    }

    /**
     * Uploads a file buffer to Cloudflare R2 and returns the public URL
     */
    async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string, customKey: string): Promise<{ url: string, key: string }> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: customKey,
                Body: fileBuffer,
                ContentType: mimeType,
            });

            await this.s3Client.send(command);

            return {
                url: `${this.publicUrl}/${customKey}`,
                key: customKey
            };
        } catch (error) {
            this.logger.error(`Failed to upload file to R2: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload file to cloud storage');
        }
    }

    /**
     * Generates a pre-signed URL for direct client-side upload to R2
     */
    async getPresignedUrl(customKey: string, mimeType: string, expiresIn: number = 3600): Promise<string> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: customKey,
                ContentType: mimeType,
            });

            const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
            return presignedUrl;
        } catch (error) {
            this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to generate upload URL');
        }
    }

    /**
     * Deletes a file from Cloudflare R2
     */
    async deleteFile(customKey: string): Promise<boolean> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: customKey,
            });

            await this.s3Client.send(command);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete file from R2: ${error.message}`, error.stack);
            return false;
        }
    }

    /**
     * Helper to extract the R2 key from a full public URL
     */
    extractKeyFromUrl(url: string): string | null {
        if (!url || (!url.startsWith(this.publicUrl) && !url.includes('r2.dev'))) {
            return null;
        }
        
        // Handle various public URL formats if necessary, but primarily our configured publicUrl
        const baseUrl = this.publicUrl.endsWith('/') ? this.publicUrl : `${this.publicUrl}/`;
        if (url.startsWith(baseUrl)) {
            return url.replace(baseUrl, '');
        }
        
        return null;
    }
}
