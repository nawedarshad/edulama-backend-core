import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    console.log('--- STARTING TEACHER MODULE INTEGRITY AUDIT ---');
    
    const profiles = await prisma.teacherProfile.findMany({
        include: {
            user: { include: { userSchools: true, authIdentities: true } },
            personalInfo: true
        }
    });

    console.log(`Auditing ${profiles.length} teacher profiles...\n`);

    let issues = 0;
    profiles.forEach(p => {
        const { id, user, schoolId, personalInfo } = p;
        const errors: string[] = [];

        if (!user) errors.push('Missing User record');
        if (!personalInfo) errors.push('Missing PersonalInfo record');
        
        if (user) {
            const hasSchoolLink = user.userSchools.some(us => us.schoolId === schoolId);
            if (!hasSchoolLink) errors.push(`User NOT member of school ${schoolId}`);

            const hasIdentity = user.authIdentities.some(ai => ai.schoolId === schoolId);
            if (!hasIdentity) errors.push(`Missing AuthIdentity for school ${schoolId}`);
        }

        if (errors.length > 0) {
            issues++;
            console.error(`[FAIL] Profile ID: ${id} | User: ${user?.name || 'N/A'}`);
            errors.forEach(e => console.error(`   -> ${e}`));
        }
    });

    if (issues === 0) {
        console.log('✅ ALL TEACHER PROFILES ARE ARCHITECTURALLY SOUND.');
    } else {
        console.warn(`\n⚠️ FOUND ${issues} PROFILES WITH ARCHITECTURAL FLAWS.`);
    }

    console.log('\n--- AUDIT COMPLETE ---');
}

check().catch(console.error).finally(() => prisma.$disconnect());
