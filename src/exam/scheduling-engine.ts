import { BadRequestException } from '@nestjs/common';
import { DayType, ExamStatus } from '@prisma/client';

export interface ScheduleSlot {
    date: string;
    startTime: string;
    duration: number;
    session: string;
}

export interface RoomInfo {
    id: number;
    name: string;
    capacity: number | null;
    benches: number;
    studentsPerBench: number;
}

export interface SchedulingConstraint {
    maxExamsPerDay: number;
    defaultDuration: number;
}

export class SchedulingEngine {
    constructor(
        private readonly constraints: SchedulingConstraint = {
            maxExamsPerDay: 2,
            defaultDuration: 180,
        }
    ) { }

    /**
     * Calculates a score for a room to determine its suitability for a slot.
     * Higher score = better fit.
     */
    calculateRoomScore(params: {
        room: RoomInfo;
        usageCount: number;
        preferredRoomId?: number;
        studentCount: number;
        existingOverlapCount: number;
    }): number {
        const { room, usageCount, preferredRoomId, studentCount, existingOverlapCount } = params;
        const totalSeats = room.benches * room.studentsPerBench;
        let score = 0;

        // 1. Base Score: Partial capacity bonus (prefer larger rooms for flexibility)
        score += totalSeats * 0.1;

        // 2. Penalty: Usage Count (SPREAD LOGIC)
        // Heavily penalize rooms that have already been used in this batch
        score -= usageCount * 150;

        // 3. Penalty: DB Overlaps
        // Penalize rooms that already have other exams scheduled (even if capacity remains)
        score -= existingOverlapCount * 50;

        // 4. Bonus: Continuity (Same Class, Same Day)
        if (preferredRoomId === room.id) {
            // Only give bonus if room isn't already over-utilized
            if (usageCount === 0) score += 300;
            else if (usageCount === 1) score += 100;
            else score += 20;
        }

        // 5. Practicality Check: Total seats must be sufficient
        if (totalSeats < studentCount) {
            score -= 10000; // Hard disqualification (softly handled by score)
        }

        return score;
    }

    /**
     * Checks if a class already has an exam in the given slot
     */
    checkClassCollision(params: {
        classId: number;
        date: string;
        startTime: string;
        sessionMap: Set<string>;
    }): boolean {
        const slotKey = `${params.classId}-${params.date}-${params.startTime}`;
        return params.sessionMap.has(slotKey);
    }

    /**
     * Checks if a class has exceeded the daily exam limit
     */
    checkDailyLimit(params: {
        classId: number;
        date: string;
        dayCountMap: Map<string, number>;
    }): boolean {
        const dayKey = `${params.classId}-${params.date}`;
        const count = params.dayCountMap.get(dayKey) ?? 0;
        return count >= this.constraints.maxExamsPerDay;
    }

    /**
     * Generates a stable room mapping for a set of classes based on strength and capacity.
     * Uses bench-based total seats for room sizing.
     */
    generateRoomTemplate(params: {
        classes: { classId: number; sectionId?: number; studentCount: number }[];
        rooms: RoomInfo[];
    }): Map<string, number> {
        const { classes, rooms } = params;
        const template = new Map<string, number>();

        // 1. Sort classes by student count (descending) - tackle big classes first
        const sortedClasses = [...classes].sort((a, b) => b.studentCount - a.studentCount);

        // 2. Available rooms queue — sorted by total seats ascending (best-fit)
        const availableRooms = [...rooms].sort((a, b) => {
            const seatsA = a.benches * a.studentsPerBench;
            const seatsB = b.benches * b.studentsPerBench;
            return seatsA - seatsB;
        });

        for (const cls of sortedClasses) {
            const classKey = `${cls.classId}-${cls.sectionId ?? 'none'}`;

            // Find the best fit room (smallest that fits)
            const roomIdx = availableRooms.findIndex(r => {
                const totalSeats = r.benches * r.studentsPerBench;
                return totalSeats >= cls.studentCount;
            });

            if (roomIdx > -1) {
                const [bestFit] = availableRooms.splice(roomIdx, 1);
                template.set(classKey, bestFit.id);
            }
        }

        return template;
    }

    /**
     * Determines the roomId for a class, prioritizing the template.
     */
    resolveRoomId(params: {
        classId: number;
        sectionId?: number;
        template?: Map<string, number>;
        dynamicFallbackId?: number | null;
    }): number | null {
        const { classId, sectionId, template, dynamicFallbackId } = params;
        const classKey = `${classId}-${sectionId ?? 'none'}`;

        if (template && template.has(classKey)) {
            return template.get(classKey)!;
        }

        return dynamicFallbackId ?? null;
    }

    /**
     * Formats a failure reason for reporting
     */
    getFailureReason(classId: number, subject: string, reason: string): { classId: number; subject: string; reason: string } {
        return { classId, subject, reason };
    }
}
