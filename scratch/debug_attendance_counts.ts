
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugAttendance() {
  console.log("--- DEBUG ATTENDANCE ---");
  
  // Find Class 1 A
  const classes = await prisma.class.findMany({
    where: { name: { contains: '1' } },
    include: { sections: true }
  });
  
  console.log("Found Classes:", classes.map(c => ({ id: c.id, name: c.name })));
  
  for (const cls of classes) {
    const section = cls.sections.find(s => s.name === 'A' || s.name === '1-A');
    if (!section) continue;
    
    console.log(`\nAnalyzing Class: ${cls.name}, Section: ${section.name} (ID: ${section.id})`);
    
    // Count active students
    const activeStudents = await prisma.studentProfile.count({
      where: { classId: cls.id, sectionId: section.id, isActive: true }
    });
    const totalStudents = await prisma.studentProfile.count({
      where: { classId: cls.id, sectionId: section.id }
    });
    console.log(`Students in DB - Active: ${activeStudents}, Total: ${totalStudents}`);
    
    // Find attendance sessions for this class-section
    const sessions = await prisma.attendanceSession.findMany({
      where: { classId: cls.id, sectionId: section.id },
      include: { 
        _count: { select: { attendances: true } },
        attendances: { include: { studentProfile: { select: { fullName: true, isActive: true } } } }
      },
      orderBy: { date: 'desc' },
      take: 5
    });
    
    console.log(`Found ${sessions.length} sessions recently.`);
    
    for (const s of sessions) {
      console.log(`Session Date: ${s.date.toISOString().split('T')[0]}, ID: ${s.id}`);
      console.log(`Attendance Count: ${s._count.attendances}`);
      s.attendances.forEach(a => {
        console.log(` - Student: ${a.studentProfile.fullName} (Active: ${a.studentProfile.isActive}, ID: ${a.studentProfileId})`);
      });
    }
  }
}

debugAttendance()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
