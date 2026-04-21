import { Injectable, Logger } from '@nestjs/common';
import { S3StorageService } from '../../common/file-upload/s3-storage.service';

@Injectable()
export class MediaService {
    private readonly logger = new Logger(MediaService.name);

    constructor(private readonly s3Storage: S3StorageService) {}

    /**
     * Get the storage prefix for a specific school's website media
     */
    private getSchoolPrefix(schoolId: number): string {
        return `schools/${schoolId}/website/`;
    }

    /**
     * List all media files for a school
     */
    async listFiles(schoolId: number) {
        const prefix = this.getSchoolPrefix(schoolId);
        this.logger.log(`Listing media files for school ${schoolId} with prefix ${prefix}`);
        return this.s3Storage.listObjects(prefix);
    }

    /**
     * Upload a file for a school
     */
    async uploadFile(schoolId: number, file: Express.Multer.File) {
        // Sanitize filename
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueFilename = `${Date.now()}-${originalName}`;
        const key = `${this.getSchoolPrefix(schoolId)}${uniqueFilename}`;

        this.logger.log(`Uploading media file for school ${schoolId} to key ${key}`);
        
        return this.s3Storage.uploadFile(
            file.buffer,
            uniqueFilename,
            file.mimetype,
            key
        );
    }

    /**
     * Delete a file for a school
     */
    async deleteFile(schoolId: number, filename: string) {
        const key = `${this.getSchoolPrefix(schoolId)}${filename}`;
        this.logger.log(`Deleting media file for school ${schoolId} with key ${key}`);
        return this.s3Storage.deleteFile(key);
    }
}
