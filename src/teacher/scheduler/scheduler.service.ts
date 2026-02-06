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

        // 1. Flatten the Syllabus into a Queue
        const topicQueue: { unit: string, chapter: string, topic: string }[] = [];
        if (syllabus && Array.isArray(syllabus)) {
            syllabus.forEach(unit => {
                if (unit.chapters && Array.isArray(unit.chapters)) {
                    unit.chapters.forEach(chapter => {
                        if (chapter.topics && Array.isArray(chapter.topics)) {
                            chapter.topics.forEach(topic => {
                                topicQueue.push({
                                    unit: unit.title,
                                    chapter: chapter.title,
                                    topic: topic.title
                                });
                            });
                        }
                    });
                }
            });
        }

        if (topicQueue.length === 0) {
            return {
                success: true,
                totalTopics: 0,
                scheduledCount: 0,
                remainingTopics: 0,
                schedule: [],
                unitTimelines: [],
                firstDate: null,
                lastDate: null
            };
        }

        console.log(`[Scheduler] Simulating for Class: ${classId}, Section: ${dto.sectionId}, Subject: ${subjectId}`);
        console.log(`[Scheduler] Topics to schedule: ${topicQueue.length}`);

        // 2. Fetch Constraints
        // a. Timetable
        const timetableEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                classId,
                sectionId: dto.sectionId,
                subjectId,
                status: { in: ['PUBLISHED', 'DRAFT', 'LOCKED'] },
            },
            include: {
                period: true,
            },
            orderBy: {
                period: { startTime: 'asc' },
            },
        });

        console.log(`[Scheduler] Found ${timetableEntries.length} timetable slots for this subject.`);

        // Map: DayOfWeek (MONDAY) -> Array of Periods
        // Schema uses 'day' enum
        const slotsByDay = new Map<string, typeof timetableEntries>();
        timetableEntries.forEach(entry => {
            const day = entry.day;
            if (!slotsByDay.has(day)) slotsByDay.set(day, []);
            slotsByDay.get(day)?.push(entry);
        });

        // b. Calendar Exceptions (Holidays)
        // Schema model: CalendarException
        const holidays = await this.prisma.calendarException.findMany({
            where: {
                schoolId,
                academicYearId,
                date: { gte: start },
                type: { in: ['HOLIDAY', 'EVENT'] },
            }
        });
        const holidaySet = new Set(holidays.map(h => format(h.date, 'yyyy-MM-dd')));

        // c. Academic Year End
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { id: academicYearId }
        });
        const yearEndDate = academicYear ? academicYear.endDate : addDays(start, 365);


        // 3. Simulation Loop
        const schedule: ScheduledSlot[] = [];
        let currentDate = start;
        let topicIndex = 0;

        // Safety break
        let daysProcessed = 0;

        while (topicIndex < topicQueue.length && (isBefore(currentDate, yearEndDate) || isSameDay(currentDate, yearEndDate)) && daysProcessed < 366) {

            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const dayOfWeekVal = getDay(currentDate);
            // date-fns: 0=Sunday, 1=Monday...
            // Enum: MONDAY, TUESDAY...
            const daysMap = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
            const dayEnum = daysMap[dayOfWeekVal];

            const isHoliday = holidaySet.has(dateStr);
            const daySlots = slotsByDay.get(dayEnum) || [];

            // Skip weekends if no slots (implicit in daySlots check)
            // But usually Sunday is explicitly ignored unless configured?
            // Rely on timetable: if no slots on Sunday, we won't schedule.

            if (!isHoliday && daySlots.length > 0) {
                for (const slot of daySlots) {
                    if (topicIndex >= topicQueue.length) break;

                    const currentItem = topicQueue[topicIndex];

                    schedule.push({
                        date: currentDate,
                        dateStr: dateStr,
                        dayOfWeek: dayEnum,
                        periodName: slot.period.name,
                        unitTitle: currentItem.unit,
                        chapterTitle: currentItem.chapter,
                        topicTitle: currentItem.topic
                    });

                    topicIndex++;
                }
            }

            currentDate = addDays(currentDate, 1);
            daysProcessed++;
        }

        console.log(`[Scheduler] Simulation complete. Scheduled: ${schedule.length} items. Days processed: ${daysProcessed}`);
        console.log(`[Scheduler] Topic Index reached: ${topicIndex}/${topicQueue.length}`);

        // 4. Construct Unit Timelines
        const unitTimelines: UnitTimeline[] = [];
        const groupedData = new Map<string, Map<string, ScheduledSlot[]>>();

        schedule.forEach(slot => {
            if (!groupedData.has(slot.unitTitle)) groupedData.set(slot.unitTitle, new Map());
            const unitMap = groupedData.get(slot.unitTitle);

            if (unitMap) {
                if (!unitMap.has(slot.chapterTitle)) unitMap.set(slot.chapterTitle, []);
                unitMap.get(slot.chapterTitle)?.push(slot);
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
            success: topicIndex === topicQueue.length,
            totalTopics: topicQueue.length,
            scheduledCount: topicIndex,
            remainingTopics: topicQueue.length - topicIndex,
            schedule,
            unitTimelines,
            firstDate: schedule.length > 0 ? schedule[0].dateStr : null,
            lastDate: schedule.length > 0 ? schedule[schedule.length - 1].dateStr : null
        };
    }

    async commitSchedule(schoolId: number, academicYearId: number, dto: SchedulePreviewDto, teacherId: number) {
        const result = await this.simulateSchedule(schoolId, academicYearId, dto);

        if (result.schedule.length === 0) {
            throw new BadRequestException("No valid slots found to schedule tasks.");
        }

        await this.prisma.$transaction(
            result.schedule.map(slot =>
                this.prisma.classDiary.create({
                    data: {
                        schoolId,
                        academicYearId,
                        teacherId,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        subjectId: dto.subjectId,
                        title: slot.topicTitle,
                        lessonDate: slot.date,
                        description: `Auto-scheduled. Unit: ${slot.unitTitle} | Chapter: ${slot.chapterTitle}`,
                    }
                })
            )
        );

        return { count: result.schedule.length };
    }
}
