import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../global/notification/notification.service';
import { NotificationType, AnnouncementPriority, AudienceType } from '@prisma/client';

@Processor('announcements', { concurrency: 2 })
@Injectable()
export class AnnouncementProcessor extends WorkerHost {
    private readonly logger = new Logger(AnnouncementProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { schoolId, creatorId, announcement, audiences } = job.data;
        this.logger.log(`Processing announcement job ${job.id} — announcement #${announcement.id}, school #${schoolId}`);

        try {
            await this.sendAnnouncementNotification(schoolId, creatorId, announcement, audiences);
            this.logger.log(`Completed announcement job ${job.id}`);
        } catch (error) {
            this.logger.error(`Failed announcement job ${job.id}`, error instanceof Error ? error.stack : error);
            throw error;
        }
    }

    private async sendAnnouncementNotification(
        schoolId: number,
        creatorId: number,
        announcement: any,
        audiences: any[],
    ) {
        if (!audiences || audiences.length === 0) return;

        const targetUserIds = new Set<number>();
        const targetRoleIds = new Set<number>();
        let isGlobal = false;

        // Collect profile IDs for bulk resolution.
        // IMPORTANT: audience.studentId is a StudentProfile.id (not User.id).
        // audience.staffId is a TeacherProfile.id (not User.id).
        // We must resolve them to User.id before passing to notification service.
        const studentProfileIds = audiences.map(a => a.studentId).filter(Boolean) as number[];
        const staffProfileIds = audiences.map(a => a.staffId).filter(Boolean) as number[];
        const sectionIds = audiences.map(a => a.sectionId).filter(Boolean) as number[];
        const classIds = audiences.map(a => a.classId).filter(Boolean) as number[];
        const roleAudienceTypes: AudienceType[] = [AudienceType.TEACHER, AudienceType.STUDENT, AudienceType.PARENTS, AudienceType.STAFF];
        const needsRoles = audiences.some(a => roleAudienceTypes.includes(a.type as AudienceType));

        // Bulk resolution in parallel — single round-trip per entity type
        const [studentUsers, staffUsers, classAndSectionUsers, allRoles] = await Promise.all([
            studentProfileIds.length > 0
                ? this.prisma.studentProfile.findMany({
                    where: { id: { in: studentProfileIds }, schoolId },
                    select: { userId: true },
                })
                : Promise.resolve([] as { userId: number | null }[]),
            staffProfileIds.length > 0
                ? this.prisma.teacherProfile.findMany({
                    where: { id: { in: staffProfileIds }, schoolId },
                    select: { userId: true },
                })
                : Promise.resolve([] as { userId: number | null }[]),
            sectionIds.length > 0 || classIds.length > 0
                ? this.prisma.studentProfile.findMany({
                    where: {
                        schoolId,
                        OR: [
                            ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds } }] : []),
                            ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
                        ],
                    },
                    select: { userId: true },
                })
                : Promise.resolve([] as { userId: number | null }[]),
            needsRoles ? this.prisma.role.findMany() : Promise.resolve([]),
        ]);

        for (const s of studentUsers) if (s.userId != null) targetUserIds.add(s.userId);
        for (const s of staffUsers) if (s.userId != null) targetUserIds.add(s.userId);
        for (const s of classAndSectionUsers) if (s.userId != null) targetUserIds.add(s.userId);

        // Resolve audience types cleanly — individual IDs already handled above via pre-fetch
        for (const audience of audiences) {
            switch (audience.type as AudienceType) {
                case AudienceType.ALL_SCHOOL:
                    isGlobal = true;
                    break;

                case AudienceType.CLASS:
                case AudienceType.SECTION:
                    // Resolved via classAndSectionUsers bulk fetch above
                    break;

                case AudienceType.STUDENT:
                    if (!audience.studentId) {
                        // No individual — target all students via role
                        allRoles
                            .filter((r: any) => r.name.toUpperCase().includes('STUDENT'))
                            .forEach((r: any) => targetRoleIds.add(r.id));
                    }
                    break;

                case AudienceType.STAFF:
                    if (!audience.staffId) {
                        allRoles
                            .filter((r: any) => r.name.toUpperCase().includes('STAFF'))
                            .forEach((r: any) => targetRoleIds.add(r.id));
                    }
                    break;

                case AudienceType.TEACHER:
                    allRoles
                        .filter((r: any) => r.name.toUpperCase().includes('TEACHER'))
                        .forEach((r: any) => targetRoleIds.add(r.id));
                    break;

                case AudienceType.PARENTS:
                    allRoles
                        .filter((r: any) => r.name.toUpperCase().includes('PARENT'))
                        .forEach((r: any) => targetRoleIds.add(r.id));
                    break;

                case AudienceType.ROLE:
                    if (audience.roleId) targetRoleIds.add(audience.roleId);
                    break;
            }
        }

        const isHighPriority =
            announcement.isEmergency ||
            announcement.priority === AnnouncementPriority.CRITICAL ||
            announcement.priority === AnnouncementPriority.URGENT;

        this.logger.log(
            `[Processor] school=${schoolId} isGlobal=${isGlobal} users=${targetUserIds.size} roles=${targetRoleIds.size} highPriority=${isHighPriority}`,
        );

        // Single notification call — no double-push for emergency.
        // Emergency gets ALERT type + title prefix handled in delivery layer.
        await this.notificationService.create(schoolId, creatorId, {
            title: announcement.isEmergency
                ? 'EMERGENCY ALERT'
                : isHighPriority
                    ? 'URGENT ANNOUNCEMENT'
                    : 'New Announcement',
            message: announcement.title,
            type: announcement.isEmergency ? NotificationType.ALERT : NotificationType.ANNOUNCEMENT,
            targetUserIds: Array.from(targetUserIds),
            targetRoleIds: Array.from(targetRoleIds),
            isGlobal,
            data: {
                announcementId: announcement.id,
                isEmergency: announcement.isEmergency,
                priority: announcement.priority,
                ...(announcement.voiceAudioUrl ? { voiceAudioUrl: announcement.voiceAudioUrl } : {}),
                ...(announcement.voiceDuration != null ? { voiceDuration: announcement.voiceDuration } : {}),
            },
        });
    }
}
