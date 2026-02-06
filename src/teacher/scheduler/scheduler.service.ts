import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, isSameDay, parseISO, format, startOfDay } from 'date-fns';
import { SchedulePreviewDto } from './dto/schedule-preview.dto';
import * as Tesseract from 'tesseract.js';


export interface ScheduledSlot {
    date: Date;
    periodName: string;
    topic: string;
    dayOfWeek: string;
}

@Injectable()
export class SchedulerService {
    constructor(private readonly prisma: PrismaService) { }

    // --- FILE EXTRACTION ---

    async extractText(file: Express.Multer.File): Promise<string> {
        if (!file) throw new BadRequestException('No file uploaded');

        const mimeType = file.mimetype;

        if (mimeType === 'application/pdf') {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(file.buffer);
            return this.cleanExtractedText(data.text);
        } else if (mimeType.startsWith('image/')) {
            const { data: { text } } = await Tesseract.recognize(file.buffer, 'eng');
            return this.cleanExtractedText(text);
        } else {
            throw new BadRequestException('Unsupported file type. Please upload a PDF or Image.');
        }
    }

    private cleanExtractedText(text: string): string {
        // Basic cleanup: remove excessive newlines, try to find lines that look like topics
        // For now, raw text is better so the user can edit it.
        // We just trim and maybe remove empty lines.
        return text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
    }

    // --- CORE ALGORITHM ---

    async simulateSchedule(schoolId: number, academicYearId: number, dto: SchedulePreviewDto) {
        const { classId, subjectId, startDate, topics } = dto;
        const start = startOfDay(parseISO(startDate));

        // 1. Fetch Constraints
        // Get Timetable Slots for this Class+Subject
        // We need to know: "Monday Period 1", "Wednesday Period 3", etc.
        const timetableEntries = await this.prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId,
                classId,
                sectionId: dto.sectionId,
                subjectId,
                status: 'PUBLISHED', // Only use active timetable
            },
            include: {
                period: true,
            },
            orderBy: {
                period: { startTime: 'asc' }, // Order by time within a day
            },
        });

        if (timetableEntries.length === 0) {
            throw new BadRequestException('No timetable slots found for this subject. Please configure the timetable first.');
        }

        // Map entries by Day of Week (Monday, Tuesday...)
        const slotsByDay = new Map<string, any[]>();
        timetableEntries.forEach(entry => {
            const day = entry.day; // Enum: MONDAY, TUESDAY...
            if (!slotsByDay.has(day)) slotsByDay.set(day, []);
            if (!slotsByDay.has(day)) slotsByDay.set(day, []);
            slotsByDay.get(day)!.push(entry);
        });

        // Get Holidays & Events (Calendar Exceptions)
        const holidays = await this.prisma.calendarException.findMany({
            where: {
                schoolId,
                academicYearId,
                date: { gte: start },
                type: { in: ['HOLIDAY', 'EVENT'] }, // Events might also block teaching? Assuming YES for now.
            },
        });
        const holidayDates = new Set(holidays.map(h => format(h.date, 'yyyy-MM-dd')));

        // Get Term End Date (School Year End) to stop infinite loops
        const academicYear = await this.prisma.academicYear.findUnique({
            where: { id: academicYearId },
        });
        const endDate = academicYear?.endDate || addDays(start, 365); // Fallback 1 year

        // 2. Simulation Loop
        const schedule: ScheduledSlot[] = [];
        let currentDate = start;
        let topicIndex = 0;

        // Safety brake: 365 days max simulation
        let daysProcessed = 0;
        while (topicIndex < topics.length && daysProcessed < 365 && currentDate <= endDate) {
            const dayName = format(currentDate, 'EEEE').toUpperCase(); // "MONDAY"
            const dateString = format(currentDate, 'yyyy-MM-dd');

            // Check 1: Is it a Holiday?
            if (holidayDates.has(dateString)) {
                // Skip
                currentDate = addDays(currentDate, 1);
                daysProcessed++;
                continue;
            }

            // Check 2: Are there slots today?
            const daysSlots = slotsByDay.get(dayName);
            if (daysSlots && daysSlots.length > 0) {
                // We have teaching slots today!
                // Sort them by time just in case
                daysSlots.sort((a, b) => a.period.startTime.localeCompare(b.period.startTime));

                for (const slot of daysSlots) {
                    if (topicIndex >= topics.length) break;

                    // ASSIGN TOPIC
                    schedule.push({
                        date: new Date(currentDate),
                        periodName: slot.period.name,
                        topic: topics[topicIndex],
                        dayOfWeek: dayName
                    });

                    topicIndex++;
                }
            }

            // Next Day
            currentDate = addDays(currentDate, 1);
            daysProcessed++;
        }

        return {
            success: topicIndex === topics.length,
            totalTopics: topics.length,
            scheduledCount: topicIndex,
            remainingTopics: topics.length - topicIndex,
            schedule,
            firstDate: schedule.length > 0 ? schedule[0].date : null,
            lastDate: schedule.length > 0 ? schedule[schedule.length - 1].date : null
        };
    }

    // --- COMMIT TO DB ---

    async commitSchedule(schoolId: number, academicYearId: number, dto: SchedulePreviewDto, teacherId: number) {
        // 1. Re-run simulation to ensure consistent state
        const result = await this.simulateSchedule(schoolId, academicYearId, dto);

        if (result.schedule.length === 0) {
            throw new BadRequestException("No valid slots found to schedule tasks.");
        }

        // 2. Bulk Create ClassDiary (Planned)
        // We will map "topics" to ClassDiary entries with status "PLANNED" (if supported) or just created entries.
        // Looking at schema `ClassDiary` doesn't have a status, but `Syllabus` does. 
        // The user wants "Lesson Plan" kind of thing. 
        // `ClassDiary` has `lessonDate` and `title`. We'll use that.

        // We'll wrap in transaction
        await this.prisma.$transaction(
            result.schedule.map(slot =>
                this.prisma.classDiary.create({
                    data: {
                        schoolId,
                        academicYearId,
                        teacherId, // We need teacherId from Request
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        // Wait, `TimetableEntry` has `sectionId`. 
                        // The simulation used `findMany` with `classId` and `subjectId`.
                        // If multiple sections have same classId/subjectId, we might get duplicate slots if we don't filter by section.
                        // Assumption: DTO should probably include `sectionId` for precise scheduling or we map generic class.
                        // Let's rely on a TODO fix for now, defaulting sectionId to the first found or passed in DTO.
                        // Fixing DTO to require sectionId is better.
                        subjectId: dto.subjectId,
                        title: slot.topic,
                        lessonDate: slot.date,
                        description: `Auto-scheduled: ${slot.topic}`,
                    }
                })
            )
        );

        return { count: result.schedule.length };
    }
}
