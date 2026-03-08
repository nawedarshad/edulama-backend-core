import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class TimetableCacheService {
    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    async invalidateAnalyticsCache(schoolId: number, academicYearId: number) {
        await Promise.all([
            this.cacheManager.del(`timetable_analytics_${schoolId}_${academicYearId}`),
            this.cacheManager.del(`timetable_comp_analytics_${schoolId}_${academicYearId}`)
        ]);
    }

    async getAnalytics(schoolId: number, academicYearId: number) {
        return this.cacheManager.get(`timetable_analytics_${schoolId}_${academicYearId}`);
    }

    async setAnalytics(schoolId: number, academicYearId: number, data: any) {
        await this.cacheManager.set(`timetable_analytics_${schoolId}_${academicYearId}`, data, 900);
    }
}
