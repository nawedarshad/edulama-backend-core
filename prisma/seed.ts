import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const modules = [
    { key: "ATTENDANCE", name: "Attendance Management" },
    { key: "EXAMS", name: "Exams & Results" },
    { key: "TIMETABLE", name: "Timetable Management" },
    { key: "LESSON_PLANNING", name: "Lesson Planning & Diary" },
    { key: "SUBSTITUTIONS", name: "Teacher Substitutions" },
    { key: "NOTICES", name: "Notice Board" },
    { key: "GRIEVANCES", name: "Grievance System" },
    { key: "CALENDAR", name: "School Calendar" },
    { key: "ANNOUNCEMENTS", name: "Announcements" },
    { key: "ADMIN_MANAGEMENT", name: "Admin Management" },
    { key: "DEPARTMENTS", name: "Departments" },
    { key: "HOUSES", name: "House System" },
    { key: "FACILITY_MANAGEMENT", name: "Facility/Room Management" },
    { key: "TEACHERS", name: "Teacher Management" },
    { key: "STUDENTS", name: "Student Management" },
    { key: "CLASSES", name: "Class Management" },
    { key: "SUBJECTS", name: "Subject Management" },
    { key: "LOGS", name: "Audit Logs" },
    { key: "SETTINGS", name: "School Settings" },
    { key: "LIBRARY", name: "Library Management" },
    { key: "MESSAGING", name: "Messaging System" },
    { key: "HOMEWORK", name: "Homework" },
    { key: "LEAVE_MANAGEMENT", name: "Leave Management" },
    { key: "ACADEMICS", name: "Academics" },
    { key: "ACTIVITIES", name: "Activities" },
    { key: "NOTIFICATIONS", name: "Notifications" },
    { key: "WEBSITE", name: "Website Builder" },
    { key: "INQUIRY", name: "Inquiry Management" }
];

async function main() {
    console.log('Start seeding modules...');

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const createdModules: any[] = [];

    for (const mod of modules) {
        const m = await prisma.module.upsert({
            where: { key: mod.key },
            update: { name: mod.name },
            create: {
                key: mod.key,
                name: mod.name,
            },
        });
        createdModules.push(m);
        console.log(`Upserted module: ${m.key}`);
    }

    // Assign all modules to schools that have NONE (for migration)
    const schools = await prisma.school.findMany({
        include: {
            _count: {
                select: { schoolModules: true }
            }
        }
    });

    for (const school of schools) {
        if (school._count.schoolModules === 0) {
            console.log(`Enabling all modules for school ${school.name} (Migration)`);
            const data = createdModules.map(m => ({
                schoolId: school.id,
                moduleId: m.id,
                enabled: true
            }));

            await prisma.schoolModule.createMany({
                data: data
            });
        }
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
