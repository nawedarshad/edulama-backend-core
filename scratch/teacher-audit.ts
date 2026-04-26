import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditTeachers(targetSchoolId?: number) {
    console.log(`--- Auditing Teachers ---`);

    const where = targetSchoolId ? { schoolId: targetSchoolId } : {};
    
    const teachers = await prisma.teacherProfile.findMany({
        where,
        include: {
            user: {
                include: {
                    authIdentities: true,
                    userSchools: { include: { roles: { include: { role: true } } } },
                    departmentMemberships: { include: { department: true } }
                }
            },
            personalInfo: true
        }
    });

    console.log(`Found ${teachers.length} teacher profiles across requested schools.`);

    let issuesCount = 0;

    for (const t of (teachers as any[])) {
        const issues: string[] = [];

        // 1. Personal Info
        if (!t.personalInfo) {
            issues.push('CRITICAL: Missing Personal Info record');
        }
        
        // 2. Auth Identity
        const emailIdentity = t.user.authIdentities.find(i => i.type === 'EMAIL');
        if (!emailIdentity) {
            issues.push('CRITICAL: Missing Email Auth Identity');
        }
        
        if (emailIdentity && t.personalInfo && emailIdentity.value.toLowerCase().trim() !== t.personalInfo.email.toLowerCase().trim()) {
            issues.push(`WARNING: Email mismatch: Auth=${emailIdentity.value}, Info=${t.personalInfo.email}`);
        }

        // 3. User School Membership
        const schoolMembership = t.user.userSchools.find(us => us.schoolId === t.schoolId);
        if (!schoolMembership) {
            issues.push(`CRITICAL: Teacher profile exists for school ${t.schoolId} but User is NOT a member of that school`);
        } else if (!schoolMembership.roles.some(r => r.role.name === 'TEACHER')) {
            issues.push('CRITICAL: User is in school but lacks TEACHER role junction');
        }

        // 4. Department Sync
        if (t.department) {
            const hasMember = t.user.departmentMemberships.some(dm => 
                dm.department.name.toLowerCase() === t.department?.toLowerCase() && dm.department.schoolId === t.schoolId
            );
            if (!hasMember) {
                issues.push(`NOTICE: Department shortcut "${t.department}" exists but no synchronized DepartmentMember record found`);
            }
        }

        // 5. EmpCode Formatting
        if (t.empCode && t.empCode !== t.empCode.trim().toUpperCase()) {
            issues.push(`NOTICE: Employee code "${t.empCode}" is not standardized (should be "${t.empCode.trim().toUpperCase()}")`);
        }

        if (issues.length > 0) {
            issuesCount++;
            console.log(`\n[ID ${t.id}] User: ${t.user.name} (School: ${t.schoolId})`);
            issues.forEach(i => console.log(`  - ${i}`));
        }
    }

    console.log(`\n--- Audit Summary ---`);
    console.log(`Total Teachers Audited: ${teachers.length}`);
    console.log(`Profiles with issues: ${issuesCount}`);
    console.log('--- End of Audit ---');
}

// You can pass a specific schoolId here if you want to audit one school
auditTeachers().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
