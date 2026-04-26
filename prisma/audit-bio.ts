import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function audit() {
    const schoolId = 7;
    
    // Find Biology subject
    const bio = await prisma.subject.findFirst({
        where: { schoolId, name: { contains: 'Biology' } }
    });
    
    if (!bio) {
        console.log('Biology not found for school', schoolId);
        return;
    }
    
    console.log(`Found Biology: ID=${bio.id}, Code=${bio.code}`);
    
    // Get all classSubjects for Biology
    const records = await prisma.classSubject.findMany({
        where: { schoolId, subjectId: bio.id },
        include: {
            class: true,
            section: true,
        }
    });
    
    console.log(`\n📊 Total Biology classSubject records: ${records.length}`);
    records.forEach(r => {
        const sectionMatchesClass = r.section ? r.section.classId === r.classId : true;
        console.log(`  ID:${r.id} | Class: ${r.class?.name}(${r.classId}) | Section: ${r.section?.name}(${r.sectionId}) | SectionClassId: ${r.section?.classId} | Match: ${sectionMatchesClass ? '✅' : '❌ MISMATCH'}`);
    });
    
    const mismatches = records.filter(r => r.section && r.section.classId !== r.classId);
    console.log(`\n❌ Mismatched records: ${mismatches.length}`);
}

audit()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
