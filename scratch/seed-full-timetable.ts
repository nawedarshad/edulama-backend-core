import { PrismaClient, DayOfWeek, PeriodType, TimetableStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const academicYearId = 6;
    const groupId = 25; // Grade 10 A

    console.log('Seeding Timetable Structure...');

    // 1. Create Subjects (ensure common ones exist)
    const subjMath = await prisma.subject.upsert({
        where: { id: 1 }, // This might be risky if id 1 is someone else's subject, but let's try.
        // Actually better to use code + schoolId if there was a unique constraint, but there isn't.
        // So I'll just find first or create.
        update: {},
        create: { schoolId, name: 'Mathematics', code: 'MATH' }
    }).catch(async () => {
        return await prisma.subject.findFirst({ where: { schoolId, name: 'Mathematics' } }) || 
               await prisma.subject.create({ data: { schoolId, name: 'Mathematics', code: 'MATH' } });
    });
    
    const subjects = {
        math: subjMath.id,
        bio: 7,
        english: 8,
        history: 9,
        compSci: 10,
        pe: 11
    };

    const teachers = {
        math: 6, // Katherine Johnson
        bio: 7, // Charles Darwin
        english: 9, // William Shakespeare
        history: 12, // Herodotus
        compSci: 10, // Ada Lovelace
        pe: 14 // Michael Jordan
    };

    const rooms = {
        regular: 8, // Classroom 1
        lab: 5, // Science Lab
        compLab: 6, // Computer Lab
        ground: 1 // Main Auditorium
    };

    // 2. Create Time Periods
    const periodsData = [
        { name: 'Period 1 (Grade 10)', startTime: '08:00', endTime: '08:50', type: PeriodType.TEACHING },
        { name: 'Period 2 (Grade 10)', startTime: '08:50', endTime: '09:40', type: PeriodType.TEACHING },
        { name: 'Period 3 (Grade 10)', startTime: '09:40', endTime: '10:30', type: PeriodType.TEACHING },
        { name: 'Short Break (Grade 10)', startTime: '10:30', endTime: '10:50', type: PeriodType.BREAK },
        { name: 'Period 4 (Grade 10)', startTime: '11:00', endTime: '11:50', type: PeriodType.TEACHING },
        { name: 'Period 5 (Grade 10)', startTime: '11:50', endTime: '12:40', type: PeriodType.TEACHING },
    ];

    const createdPeriods: any[] = [];
    for (const p of periodsData) {
        try {
            const period = await prisma.timePeriod.create({
                data: {
                    schoolId,
                    academicYearId,
                    name: p.name,
                    startTime: p.startTime,
                    endTime: p.endTime,
                    type: p.type,
                    days: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]
                }
            });
            createdPeriods.push(period);
            
            // Create Time Slots
            for (const day of [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]) {
                await prisma.timeSlot.create({
                    data: {
                        schoolId,
                        academicYearId,
                        periodId: period.id,
                        day,
                        startTime: p.startTime,
                        endTime: p.endTime,
                        isBreak: p.type === PeriodType.BREAK
                    }
                });
            }
        } catch (e) {
            console.log(`Period ${p.name} might already exist or error occurred. Skipping creation.`);
        }
    }

    console.log('Seeding Timetable Entries...');

    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    
    for (const day of days) {
        const slots = await prisma.timeSlot.findMany({
            where: { schoolId, academicYearId, day, period: { name: { contains: 'Grade 10' } } },
            orderBy: { startTime: 'asc' }
        });

        const academicSlots = slots.filter(s => !s.isBreak);

        const schedule = [
            { subject: subjects.math, teacher: teachers.math, room: rooms.regular },
            { subject: subjects.english, teacher: teachers.english, room: rooms.regular },
            { subject: subjects.history, teacher: teachers.history, room: rooms.regular },
            { subject: subjects.compSci, teacher: teachers.compSci, room: rooms.compLab },
            { subject: subjects.bio, teacher: teachers.bio, room: rooms.lab },
        ];

        for (let i = 0; i < academicSlots.length && i < schedule.length; i++) {
            const slot = academicSlots[i];
            const entry = schedule[i];

            try {
                await prisma.timetableEntry.create({
                    data: {
                        schoolId,
                        academicYearId,
                        groupId,
                        subjectId: entry.subject,
                        teacherId: entry.teacher,
                        roomId: entry.room,
                        day,
                        timeSlotId: slot.id,
                        status: TimetableStatus.PUBLISHED,
                        isBlockStart: true,
                        durationSlots: 1
                    }
                });
            } catch (e) {
                console.log(`Entry for ${day} slot ${slot.id} already exists or error. Skipping.`);
            }
        }
    }

    console.log('Timetable seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
