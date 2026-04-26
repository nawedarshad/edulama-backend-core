import { PrismaClient, AuthType } from '@prisma/client';

const prisma = new PrismaClient();

async function harden() {
    console.log('--- STARTING TEACHER DATA HARDENING AND RECOVERY ---');
    const teacherRoleId = 3;

    // 1. Get all teacher profiles
    const teachers = await prisma.teacherProfile.findMany({
        include: {
            user: {
                include: {
                    userSchools: true,
                    authIdentities: true,
                    userRoles: true
                }
            },
            personalInfo: true
        }
    });

    console.log(`Found ${teachers.length} teacher profiles to harden.\n`);

    for (const teacher of teachers) {
        const { user, schoolId, id: profileId } = teacher;
        console.log(`Processing [ID ${profileId}] User: ${user.name} (School: ${schoolId})`);

        // A. Hardening UserSchool Membership
        const hasMembership = user.userSchools.some(us => us.schoolId === schoolId);
        let userSchoolId: number;

        if (!hasMembership) {
            console.log(`   + Creating missing UserSchool membership...`);
            const membership = await prisma.userSchool.create({
                data: {
                    userId: user.id,
                    schoolId: schoolId,
                    primaryRoleId: teacherRoleId,
                    isActive: true
                }
            });
            userSchoolId = membership.id;
        } else {
            userSchoolId = user.userSchools.find(us => us.schoolId === schoolId)!.id;
        }

        // B. Hardening UserSchoolRole
        await prisma.userSchoolRole.upsert({
            where: {
                userSchoolId_roleId: {
                    userSchoolId: userSchoolId,
                    roleId: teacherRoleId
                }
            },
            update: {},
            create: {
                userSchoolId: userSchoolId,
                roleId: teacherRoleId
            }
        });

        // C. Hardening UserRole junction (Global)
        await prisma.userRole.upsert({
            where: {
                userId_roleId: {
                    userId: user.id,
                    roleId: teacherRoleId
                }
            },
            update: {},
            create: {
                userId: user.id,
                roleId: teacherRoleId
            }
        });

        // D. Hardening TeacherPersonalInfo
        if (!teacher.personalInfo) {
            console.log(`   + Synthesizing missing TeacherPersonalInfo...`);
            await prisma.teacherPersonalInfo.create({
                data: {
                    staffId: profileId,
                    fullName: user.name,
                    gender: 'NOT_SPECIFIED',
                    dateOfBirth: new Date('1990-01-01'),
                    phone: '0000000000',
                    alternatePhone: '0000000000',
                    email: `${user.name.toLowerCase().replace(/ /g, '.')}@studentcare.edu`,
                    addressLine1: 'School Campus',
                    city: 'Unknown',
                    state: 'Unknown',
                    country: 'Unknown',
                    postalCode: '000000',
                    emergencyContactName: 'School Admin',
                    emergencyContactPhone: '0000000000'
                }
            });
        }

        // E. Hardening AuthIdentity (Respect 1:1 constraint with User)
        if (user.authIdentities.length === 0) {
            console.log(`   + Creating mission-critical AuthIdentity...`);
            await prisma.authIdentity.create({
                data: {
                    userId: user.id,
                    schoolId: schoolId,
                    type: AuthType.USERNAME,
                    value: user.name.toLowerCase().replace(/ /g, '.'),
                    secret: 'password123',
                    verified: true
                }
            });
        } else {
            // Update existing identity if it lacks a school context
            const primaryIdentity = user.authIdentities[0];
            if (!primaryIdentity.schoolId) {
                console.log(`   + Patching legacy AuthIdentity with school context...`);
                await prisma.authIdentity.update({
                    where: { id: primaryIdentity.id },
                    data: { schoolId: schoolId }
                });
            }
        }
    }

    console.log('\n--- HARDENING COMPLETE ---');
}

harden()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
