import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType, AnnouncementPriority, AudienceType } from '@prisma/client';

@Processor('announcements')
@Injectable()
export class AnnouncementProcessor extends WorkerHost {
    private readonly logger = new Logger(AnnouncementProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { schoolId, creatorId, announcement, audiences } = job.data;
        this.logger.log(`Processing announcement job ${job.id} for school ${schoolId}`);

        try {
            await this.sendAnnouncementNotification(schoolId, creatorId, announcement, audiences);
            this.logger.log(`Successfully processed announcement job ${job.id}`);
        } catch (error) {
            this.logger.error(`Failed to process announcement job ${job.id}`, error instanceof Error ? error.stack : error);
            throw error;
        }
    }

    private async sendAnnouncementNotification(
        schoolId: number,
        creatorId: number,
        announcement: any,
        audiences: any[]
    ) {
        if (!audiences || audiences.length === 0) return;

        const targetUserIds = new Set<number>();
        const targetRoleIds = new Set<number>();
        let isGlobal = false;

        // 1. Prepare Bulk Resolution
        const sectionIds = audiences.map((a: any) => a.sectionId).filter(Boolean);
        const classIds = audiences.map((a: any) => a.classId).filter(Boolean);
        const needsRoles = audiences.some((a: any) => [AudienceType.TEACHER, AudienceType.STUDENT, AudienceType.PARENTS, AudienceType.STAFF].includes(a.type as any));

        // 1a. Bulk Fetch Roles
        let allRoles: any[] = [];
        if (needsRoles) {
            allRoles = await this.prisma.role.findMany();
        }

        // 1b. Bulk Fetch Students for Classes and Sections
        if (sectionIds.length > 0 || classIds.length > 0) {
            const students = await this.prisma.studentProfile.findMany({
                where: {
                    schoolId,
                    OR: [
                        { sectionId: { in: sectionIds } },
                        { classId: { in: classIds } }
                    ]
                },
                select: { userId: true }
            });
            students.forEach((s: any) => targetUserIds.add(s.userId));
        }

        // 2. Resolve Iteratively using Bulk Fetched Data
        for (const audience of audiences) {
            if (audience.studentId) targetUserIds.add(audience.studentId);
            if (audience.staffId) targetUserIds.add(audience.staffId);
            if (audience.roleId) targetRoleIds.add(audience.roleId);

            // Handle ALL_SCHOOL
            if (audience.type === AudienceType.ALL_SCHOOL) {
                isGlobal = true;
            }
            // Handle Generic Role-based Audiences
            else if ([AudienceType.TEACHER, AudienceType.STUDENT, AudienceType.PARENTS, AudienceType.STAFF].includes(audience.type)) {
                let roleNameKeyword = '';
                if (audience.type === AudienceType.TEACHER) roleNameKeyword = 'TEACHER';
                else if (audience.type === AudienceType.STUDENT) roleNameKeyword = 'STUDENT';
                else if (audience.type === AudienceType.PARENTS) roleNameKeyword = 'PARENT';
                else if (audience.type === AudienceType.STAFF) roleNameKeyword = 'STAFF';

                if (roleNameKeyword) {
                    const matchingRoles = allRoles.filter((r: any) => r.name.toUpperCase().includes(roleNameKeyword));
                    matchingRoles.forEach((r: any) => targetRoleIds.add(r.id));
                }
            }
        }

        const notificationData = {
            announcementId: announcement.id,
            isEmergency: announcement.isEmergency,
            priority: announcement.priority,
            voiceAudioUrl: announcement.voiceAudioUrl,
            voiceDuration: announcement.voiceDuration,
        };

        // 2. Send Standard Notification
        await this.notificationService.create(schoolId, creatorId, {
            title: 'New Announcement',
            message: announcement.title,
            type: NotificationType.ANNOUNCEMENT,
            targetUserIds: Array.from(targetUserIds),
            targetRoleIds: Array.from(targetRoleIds),
            isGlobal,
            data: notificationData
        });

        // 3. Send Emergency Alert if applicable
        if (announcement.isEmergency || announcement.priority === AnnouncementPriority.CRITICAL || announcement.priority === AnnouncementPriority.URGENT) {
            await this.notificationService.create(schoolId, creatorId, {
                title: announcement.isEmergency ? 'EMERGENCY ALERT' : 'URGENT ANNOUNCEMENT',
                message: `${announcement.isEmergency ? 'URGENT' : 'Attention'}: ${announcement.title}`,
                type: NotificationType.ALERT,
                targetUserIds: Array.from(targetUserIds),
                targetRoleIds: Array.from(targetRoleIds),
                isGlobal,
                data: notificationData
            });
        }
    }
}
