import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

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
        // If the user hasn't set R2_PUBLIC_URL, default to the r2.dev subdomain format (or custom domain)
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
            // R2 requires this to be true for certain operations depending on the setup, but usually works with default
        });
    }

    /**
     * Uploads a file buffer to Cloudflare R2 and returns the public URL
     */
    async uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string, customKey: string): Promise<string> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: customKey,
                Body: fileBuffer,
                ContentType: mimeType,
            });

            await this.s3Client.send(command);

            // Return the public URL for the file
            return `${this.publicUrl}/${customKey}`;
        } catch (error) {
            this.logger.error(`Failed to upload file to R2: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload file to cloud storage');
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
            return false; // Sometimes we just want to suppress deletion errors so the DB record can still be deleted
        }
    }

    /**
     * Helper to extract the R2 key from a full public URL
     */
    extractKeyFromUrl(url: string): string | null {
        if (!url || !url.startsWith(this.publicUrl)) {
            return null;
        }
        return url.replace(`${this.publicUrl}/`, '');
    }
}
