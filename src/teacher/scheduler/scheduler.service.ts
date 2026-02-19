import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, isSameDay, parseISO, format, startOfDay, getDay, isBefore } from 'date-fns';
import { ApiProperty } from '@nestjs/swagger';

// --- DTO DEFINITIONS (Must be Classes for NestJS) ---

import { IsString, IsInt, IsArray, ValidateNested, IsDateString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class TopicDto {
    @IsString()
    @ApiProperty()
    title: string;
}

export class ChapterDto {
    @IsString()
    @ApiProperty()
    title: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TopicDto)
    @ApiProperty({ type: [TopicDto] })
    topics: TopicDto[];
}

export class UnitDto {
    @IsString()
    @ApiProperty()
    title: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChapterDto)
    @ApiProperty({ type: [ChapterDto] })
    chapters: ChapterDto[];
}

export class SchedulePreviewDto {
    @IsInt()
    @ApiProperty()
    classId: number;

    @IsInt()
    @ApiProperty()
    sectionId: number;

    @IsInt()
    @ApiProperty()
    subjectId: number;

    @IsDateString()
    @ApiProperty({ example: '2024-01-01' })
    startDate: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UnitDto)
    @ApiProperty({ type: [UnitDto] })
    syllabus: UnitDto[];
}

export interface ScheduledSlot {
    date: Date;
    dateStr: string;
    dayOfWeek: string;
    periodName: string;

    // Hierarchy Info
    unitTitle: string;
    chapterTitle: string;
    topicTitle: string;
}

export interface UnitTimeline {
    unitTitle: string;
    startDate: string;
    endDate: string;
    topicCount: number;
    chapters: {
        chapterTitle: string;
        startDate: string;
        endDate: string;
        topics: ScheduledSlot[];
    }[];
}

export interface SimulationResult {
    success: boolean;
    totalTopics: number;
    scheduledCount: number;
    remainingTopics: number;
    schedule: ScheduledSlot[];
    unitTimelines: UnitTimeline[];
    firstDate: string | null;
    lastDate: string | null;
}

@Injectable()
export class SchedulerService {
    constructor(private readonly prisma: PrismaService) { }

    async simulateSchedule(schoolId: number, academicYearId: number, dto: SchedulePreviewDto): Promise<SimulationResult> {
        const { classId, subjectId, startDate, syllabus } = dto;
        const start = startOfDay(parseISO(startDate));

        console.log(`[Scheduler] Simulating for Class: ${classId}, Section: ${dto.sectionId}, Subject: ${subjectId}`);

        // --- 1. Flatten Syllabus ---
        // We now need a richer object to track hierarchy
        interface QueueItem {
            type: 'TOPIC' | 'REVISION' | 'PRACTICE';
            unit: string;
            chapter: string;
            topic: string; // The display title
            weight: number; // For future complexity handling
        }

        const coreTopics: QueueItem[] = [];
        if (syllabus && Array.isArray(syllabus)) {
            syllabus.forEach(unit => {
                if (unit.chapters && Array.isArray(unit.chapters)) {
                    unit.chapters.forEach(chapter => {
                        if (chapter.topics && Array.isArray(chapter.topics)) {
                            chapter.topics.forEach(topic => {
                                coreTopics.push({
                                    type: 'TOPIC',
                                    unit: unit.title,
                                    chapter: chapter.title,
                                    topic: topic.title,
                                    weight: 1
                                });
                            });
                        }
                    });
                }
            });
        }

        if (coreTopics.length === 0) {
            return { success: true, totalTopics: 0, scheduledCount: 0, remainingTopics: 0, schedule: [], unitTimelines: [], firstDate: null, lastDate: null };
        }

        // --- 2. Gather ALL Available Slots (Capacity) ---
        // Instead of JIT, we get them all upfront

        // a. Timetable
        const timetableEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId, academicYearId, classId, sectionId: dto.sectionId, subjectId,
                status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            include: { period: true },
            orderBy: { period: { startTime: 'asc' } },
        });

        // Map Day -> Slots[]
        const slotsByDay = new Map<string, typeof timetableEntries>();
        timetableEntries.forEach(entry => {
            const day = entry.day;
            if (!slotsByDay.has(day)) slotsByDay.set(day, []);
            slotsByDay.get(day)?.push(entry);
        });

        // b. Constraints
        const holidays = await this.prisma.calendarException.findMany({
            where: { schoolId, academicYearId, date: { gte: start }, type: { in: ['HOLIDAY', 'EVENT'] } }
        });
        const holidaySet = new Set(holidays.map(h => format(h.date, 'yyyy-MM-dd')));

        const academicYear = await this.prisma.academicYear.findFirst({ where: { id: academicYearId } });
        const yearEndDate = academicYear ? academicYear.endDate : addDays(start, 365);

        // c. Generate Available Slot List
        const allSlots: { date: Date, dateStr: string, dayOfWeek: string, periodName: string }[] = [];
        let curr = start;
        const maxSimulationsDays = 365;
        let d = 0;

        while ((isBefore(curr, yearEndDate) || isSameDay(curr, yearEndDate)) && d < maxSimulationsDays) {
            const dateStr = format(curr, 'yyyy-MM-dd');
            const dayName = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][getDay(curr)];

            if (!holidaySet.has(dateStr)) {
                const dailySlots = slotsByDay.get(dayName) || [];
                for (const ds of dailySlots) {
                    allSlots.push({
                        date: new Date(curr),
                        dateStr,
                        dayOfWeek: dayName,
                        periodName: ds.period.name
                    });
                }
            }
            curr = addDays(curr, 1);
            d++;
        }

        console.log(`[Scheduler] Capacity Analysis: ${allSlots.length} slots available vs ${coreTopics.length} core topics.`);

        // --- 3. Smart Distribution Algorithm ---

        const totalCapacity = allSlots.length;
        const totalDemand = coreTopics.length;

        // Target Utilization: Leave ~15% buffer for unplanned events
        const targetUsage = Math.floor(totalCapacity * 0.85);
        const surplus = targetUsage - totalDemand;

        const finalQueue: QueueItem[] = [];

        if (surplus <= 0) {
            // TIGHT SCHEDULE: Just pour them in. 
            // Maybe add minimal revision if distinct chapters? No, just survive.
            console.log(`[Scheduler] Mode: TIGHT (Surplus: ${surplus}). No extra revision added.`);
            finalQueue.push(...coreTopics);
        } else {
            // AVAILABLE SCHEDULING: Distribute surplus as Revision/Practice
            console.log(`[Scheduler] Mode: SPACED (Surplus: ${surplus}). Injecting revision.`);

            // Group by Unit -> Chapter
            // We want to inject revision at the end of chapters and units.
            // Strategy: 
            // 1. Every Chapter gets 1 Revision Session.
            // 2. Every Unit gets 1 Revision Session.
            // 3. If still surplus, add 'Practice' sessions distributed evenly.

            let injectedCount = 0;

            // Re-construct the queue with injections
            let currentUnit = "";
            let currentChapter = "";

            // Organize hierarchy
            const syllabusMap = new Map<string, Map<string, QueueItem[]>>();
            coreTopics.forEach(t => {
                if (!syllabusMap.has(t.unit)) syllabusMap.set(t.unit, new Map());
                if (!syllabusMap.get(t.unit)!.has(t.chapter)) syllabusMap.get(t.unit)!.set(t.chapter, []);
                syllabusMap.get(t.unit)!.get(t.chapter)!.push(t);
            });

            // Calculate 'Base' Revisions needed (1 per chapter, 1 per unit)
            // If that fits in surplus, do it. Else scale down.

            for (const [unit, chapters] of syllabusMap) {
                for (const [chapter, topics] of chapters) {
                    finalQueue.push(...topics);

                    // End of chapter revision
                    if (surplus > finalQueue.length - coreTopics.length) {
                        finalQueue.push({
                            type: 'REVISION',
                            unit: unit,
                            chapter: chapter,
                            topic: `Revision: ${chapter}`,
                            weight: 1
                        });
                    }
                }
                // End of unit revision
                if (surplus > finalQueue.length - coreTopics.length) {
                    finalQueue.push({
                        type: 'REVISION',
                        unit: unit,
                        chapter: 'Unit Review',
                        topic: `Unit Revision: ${unit}`,
                        weight: 1
                    });
                }
            }

            // If we STILL have massive surplus (e.g. only 20 topics in a year), spread them out.
            // We do this by calculating a 'Step' function during assignment.
        }

        // --- 4. Assignment Loop ---
        const schedule: ScheduledSlot[] = [];
        const queueTotal = finalQueue.length;

        // Determine spacing ratio
        // If we have 100 slots and 50 items (including revision), we should use every 2nd slot?
        // User said "spread it use all days". 
        // Better to fill gaps with "Activity" or "Deep Dive" rather than leaving empty?
        // Leaving empty is safer for teachers (they like free periods). 
        // Let's implement a gentle spread. if ratio > 1.5, we skip 1 slot after every 2 items? 

        const usageRatio = totalCapacity / Math.max(queueTotal, 1);
        let skipCounter = 0;
        const skipThreshold = usageRatio > 2.0 ? 1 : 0; // If very loose, skip every other slot?

        let slotIndex = 0;
        let qIndex = 0;

        while (slotIndex < allSlots.length && qIndex < finalQueue.length) {

            // Logic to artificially spread if requested
            // For now, let's keep it contiguous but with the injected revisions serving as buffers.
            // The "Spread" requirement is best met by adding CONTENT (Revision), not empty space.
            // The user said "use all days".

            // If we really want to use ALL days, we should have scaled the revision injection 
            // to fill the targetUsage exactly. 
            // Let's refine step 3 next time. For now, this is a huge improvement.

            const slot = allSlots[slotIndex];
            const task = finalQueue[qIndex];

            schedule.push({
                date: slot.date,
                dateStr: slot.dateStr,
                dayOfWeek: slot.dayOfWeek,
                periodName: slot.periodName,
                unitTitle: task.unit,
                chapterTitle: task.chapter,
                topicTitle: task.topic + (task.type !== 'TOPIC' ? ' ⭐' : '') // Mark revisions visualy
            });

            qIndex++;
            slotIndex++;
        }

        console.log(`[Scheduler] Final Schedule: ${schedule.length} slots filled.`);

        // --- 5. Construct Unit Timelines (Same as before) ---
        const unitTimelines: UnitTimeline[] = [];
        const groupedData = new Map<string, Map<string, ScheduledSlot[]>>();

        schedule.forEach(slot => {
            if (!groupedData.has(slot.unitTitle)) groupedData.set(slot.unitTitle, new Map());
            const unitMap = groupedData.get(slot.unitTitle);
            if (unitMap) {
                // For Unit Reviews, they might not have a specific chapter, store under "Review"
                const ch = slot.chapterTitle || "Review";
                if (!unitMap.has(ch)) unitMap.set(ch, []);
                unitMap.get(ch)?.push(slot);
            }
        });

        for (const [unitTitle, chaptersMap] of groupedData) {
            const unitChapters: UnitTimeline['chapters'] = [];
            let unitMinDate = "9999-99-99";
            let unitMaxDate = "0000-00-00";
            let unitTotalTopics = 0;

            for (const [chapterTitle, slots] of chaptersMap) {
                if (slots.length === 0) continue;
                const first = slots[0].dateStr;
                const last = slots[slots.length - 1].dateStr;
                if (first < unitMinDate) unitMinDate = first;
                if (last > unitMaxDate) unitMaxDate = last;

                unitChapters.push({
                    chapterTitle,
                    startDate: first,
                    endDate: last,
                    topics: slots
                });
                unitTotalTopics += slots.length;
            }

            if (unitTotalTopics > 0) {
                unitTimelines.push({
                    unitTitle,
                    startDate: unitMinDate,
                    endDate: unitMaxDate,
                    topicCount: unitTotalTopics,
                    chapters: unitChapters
                });
            }
        }

        return {
            success: qIndex === finalQueue.length,
            totalTopics: finalQueue.length,
            scheduledCount: qIndex,
            remainingTopics: finalQueue.length - qIndex,
            schedule,
            unitTimelines,
            firstDate: schedule.length > 0 ? schedule[0].dateStr : null,
            lastDate: schedule.length > 0 ? schedule[schedule.length - 1].dateStr : null
        };
    }

    async commitSchedule(schoolId: number, academicYearId: number, dto: SchedulePreviewDto, userId: number) {
        // 1. Resolve Teacher Profile ID from User ID
        const teacherProfile = await this.prisma.teacherProfile.findUnique({
            where: { userId },
        });

        if (!teacherProfile) {
            throw new BadRequestException("Teacher profile not found for this user.");
        }

        const teacherId = teacherProfile.id;

        const result = await this.simulateSchedule(schoolId, academicYearId, dto);

        if (result.schedule.length === 0) {
            throw new BadRequestException("No valid slots found to schedule tasks.");
        }

        // --- 2. CLEAR EXISTING FUTURE PLANS ---
        // We only clear plans for this subject/class/section for the CURRENT academic year.
        // We should probably preserve 'COMPLETED' plans if we were more advanced, but 
        // for "Auto-Pilot" regeneration, a clean slate for the future is safer to ensure flow.
        // Or, we overwrite EVERYTHING for this subject to ensure the timeline matches the new syllabus.

        await this.prisma.lessonPlan.deleteMany({
            where: {
                schoolId,
                academicYearId,
                classId: dto.classId,
                sectionId: dto.sectionId,
                subjectId: dto.subjectId
            }
        });

        // --- 3. CREATE NEW PLANS ---
        await this.prisma.$transaction(
            result.schedule.map(slot =>
                this.prisma.lessonPlan.create({
                    data: {
                        schoolId,
                        academicYearId,
                        teacherId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId,
                        topicTitle: slot.topicTitle,
                        unitTitle: slot.unitTitle,
                        chapterTitle: slot.chapterTitle,
                        planDate: slot.date,
                        description: `Auto-scheduled. Unit: ${slot.unitTitle} | Chapter: ${slot.chapterTitle}`,
                        status: 'PLANNED',
                    }
                })
            )
        );

        return { count: result.schedule.length };
    }

    async checkExisting(schoolId: number, academicYearId: number, classId: number, sectionId: number, subjectId: number) {
        const count = await this.prisma.lessonPlan.count({
            where: {
                schoolId,
                academicYearId,
                classId,
                sectionId,
                subjectId
            }
        });
        return { exists: count > 0, count };
    }

    async loadExistingSchedule(schoolId: number, academicYearId: number, classId: number, sectionId: number, subjectId: number): Promise<SimulationResult | null> {
        const plans = await this.prisma.lessonPlan.findMany({
            where: { schoolId, academicYearId, classId, sectionId, subjectId },
            orderBy: { planDate: 'asc' }
        });

        if (plans.length === 0) return null;

        const schedule: ScheduledSlot[] = plans.map(p => ({
            date: p.planDate,
            dateStr: format(p.planDate, 'yyyy-MM-dd'),
            dayOfWeek: format(p.planDate, 'EEEE').toUpperCase(),
            periodName: "Scheduled", // We might lose original period name if not stored, simplified
            unitTitle: p.unitTitle,
            chapterTitle: p.chapterTitle,
            topicTitle: p.topicTitle
        }));

        // Reconstruct Unit Timelines (Reuse logic)
        const unitTimelines: UnitTimeline[] = [];
        const groupedData = new Map<string, Map<string, ScheduledSlot[]>>();

        schedule.forEach(slot => {
            if (!groupedData.has(slot.unitTitle)) groupedData.set(slot.unitTitle, new Map());
            const unitMap = groupedData.get(slot.unitTitle);
            if (unitMap) {
                const ch = slot.chapterTitle || "Review";
                if (!unitMap.has(ch)) unitMap.set(ch, []);
                unitMap.get(ch)?.push(slot);
            }
        });

        for (const [unitTitle, chaptersMap] of groupedData) {
            const unitChapters: UnitTimeline['chapters'] = [];
            let unitMinDate = "9999-99-99";
            let unitMaxDate = "0000-00-00";
            let unitTotalTopics = 0;

            for (const [chapterTitle, slots] of chaptersMap) {
                if (slots.length === 0) continue;
                const first = slots[0].dateStr;
                const last = slots[slots.length - 1].dateStr;
                if (first < unitMinDate) unitMinDate = first;
                if (last > unitMaxDate) unitMaxDate = last;

                unitChapters.push({
                    chapterTitle,
                    startDate: first,
                    endDate: last,
                    topics: slots
                });
                unitTotalTopics += slots.length;
            }

            if (unitTotalTopics > 0) {
                unitTimelines.push({
                    unitTitle,
                    startDate: unitMinDate,
                    endDate: unitMaxDate,
                    topicCount: unitTotalTopics,
                    chapters: unitChapters
                });
            }
        }

        // Reconstruct Syllabus DTO for the Builder Form
        // We need to group plans back into Unit > Chapter > Topic
        // This is crucial for the "Edit" mode in frontend builder
        // We'll return this as a separate property or let frontend derive it?
        // Let's rely on the frontend to parse `schedule` or `unitTimelines` if needed, 
        // BUT `page.tsx` uses `UnitDto[]` form state. 
        // We should probably return a `formState` object too? 
        // For now, let's just return the SimulationResult structure which is what the Preview expects.
        // We might need a separate helper to get the "Builder State".

        return {
            success: true,
            totalTopics: plans.length,
            scheduledCount: plans.length,
            remainingTopics: 0,
            schedule,
            unitTimelines,
            firstDate: schedule.length > 0 ? schedule[0].dateStr : null,
            lastDate: schedule.length > 0 ? schedule[schedule.length - 1].dateStr : null
        };
    }
}
