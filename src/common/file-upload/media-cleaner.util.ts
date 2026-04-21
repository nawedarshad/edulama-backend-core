import { S3StorageService } from "./s3-storage.service";

/**
 * Utility to help clean up media files from Cloudflare R2
 */
export class MediaCleaner {
    /**
     * Recursively extracts all R2 storage keys from a deep object/array
     */
    static extractKeys(obj: any, s3Storage: S3StorageService): Set<string> {
        const keys = new Set<string>();

        const recurse = (current: any) => {
            if (!current) return;

            if (typeof current === 'string') {
                const key = s3Storage.extractKeyFromUrl(current);
                if (key) {
                    keys.add(key);
                }
            } else if (Array.isArray(current)) {
                current.forEach(item => recurse(item));
            } else if (typeof current === 'object') {
                Object.values(current).forEach(value => recurse(value));
            }
        };

        recurse(obj);
        return keys;
    }

    /**
     * Identifies which keys should be deleted based on old vs new state
     */
    static getKeysToDelete(oldObj: any, newObj: any, s3Storage: S3StorageService): string[] {
        const oldKeys = this.extractKeys(oldObj, s3Storage);
        const newKeys = this.extractKeys(newObj, s3Storage);

        const toDelete: string[] = [];
        oldKeys.forEach(key => {
            if (!newKeys.has(key)) {
                toDelete.push(key);
            }
        });

        return toDelete;
    }
}
