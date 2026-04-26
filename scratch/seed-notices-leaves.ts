import { PrismaClient, NoticeType, NoticePriority, LeaveStatus, LeaveCategory, StudentLeaveApprovalWorkflow } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const academicYearId = 6;
    const teacherId = 37; // Nandini Gupta
    const teacherUserId = 59;
    const studentUserId = 10; // Nawed Arshad (from list-users output, id: 10 has schoolId: 7)
    
    console.log('Seeding Leave Types...');
    
    // Create Leave Types
    const sickLeaveTeacher = await prisma.leaveType.upsert({
        where: { schoolId_code_category: { schoolId, code: 'SL-T', category: LeaveCategory.TEACHER } },
        update: {},
        create: {
            schoolId,
            name: 'Sick Leave (Teacher)',
            code: 'SL-T',
            category: LeaveCategory.TEACHER,
            description: 'Medical leave for teachers',
            color: '#FF0000',
            requiresDocument: true,
            isActive: true
        }
    });

    const casualLeaveTeacher = await prisma.leaveType.upsert({
        where: { schoolId_code_category: { schoolId, code: 'CL-T', category: LeaveCategory.TEACHER } },
        update: {},
        create: {
            schoolId,
            name: 'Casual Leave (Teacher)',
            code: 'CL-T',
            category: LeaveCategory.TEACHER,
            description: 'General casual leave',
            color: '#00FF00',
            isActive: true
        }
    });

    const sickLeaveStudent = await prisma.leaveType.upsert({
        where: { schoolId_code_category: { schoolId, code: 'SL-S', category: LeaveCategory.STUDENT } },
        update: {},
        create: {
            schoolId,
            name: 'Sick Leave (Student)',
            code: 'SL-S',
            category: LeaveCategory.STUDENT,
            description: 'Medical leave for students',
            color: '#FF5733',
            requiresDocument: true,
            studentLeaveApprovalWorkflow: StudentLeaveApprovalWorkflow.CLASS_TEACHER_FIRST,
            isActive: true
        }
    });

    console.log('Seeding Notices...');

    // Create Notices
    await prisma.notice.createMany({
        data: [
            {
                schoolId,
                academicYearId,
                title: 'Monthly Staff Meeting',
                content: 'All staff members are required to attend the monthly meeting in the auditorium this Friday at 3:00 PM.',
                priority: NoticePriority.HIGH,
                type: NoticeType.SCHOOL,
                teacherId, // Created by this teacher/admin
                requiresAck: true,
            },
            {
                schoolId,
                academicYearId,
                title: 'Sports Day Postponed',
                content: 'Due to expected heavy rain, the Annual Sports Day has been postponed to next Saturday.',
                priority: NoticePriority.NORMAL,
                type: NoticeType.GENERAL,
                teacherId,
                requiresAck: false,
            },
            {
                schoolId,
                academicYearId,
                title: 'Math Homework Submission',
                content: 'Please submit your Algebra assignments by Wednesday noon.',
                priority: NoticePriority.NORMAL,
                type: NoticeType.CLASS,
                classId: 13, // Grade 10
                teacherId,
                requiresAck: false,
            }
        ]
    });

    console.log('Seeding Leave Requests...');

    // Create Leave Requests
    // Teacher Leave Request
    await prisma.leaveRequest.create({
        data: {
            schoolId,
            academicYearId,
            applicantId: teacherUserId,
            leaveTypeId: sickLeaveTeacher.id,
            startDate: new Date('2026-04-20'),
            endDate: new Date('2026-04-21'),
            daysCount: 2,
            reason: 'Suffering from fever',
            status: LeaveStatus.APPROVED,
            approvedById: 1, // Approved by system admin
            actionAt: new Date(),
        }
    });

    await prisma.leaveRequest.create({
        data: {
            schoolId,
            academicYearId,
            applicantId: teacherUserId,
            leaveTypeId: casualLeaveTeacher.id,
            startDate: new Date('2026-05-10'),
            endDate: new Date('2026-05-10'),
            daysCount: 1,
            reason: 'Personal work',
            status: LeaveStatus.PENDING,
        }
    });

    // Student Leave Request
    await prisma.leaveRequest.create({
        data: {
            schoolId,
            academicYearId,
            applicantId: studentUserId,
            leaveTypeId: sickLeaveStudent.id,
            startDate: new Date('2026-04-25'),
            endDate: new Date('2026-04-26'),
            daysCount: 2,
            reason: 'Family emergency',
            status: LeaveStatus.PENDING,
        }
    });

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
