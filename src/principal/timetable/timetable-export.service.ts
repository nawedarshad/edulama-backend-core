import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { DayOfWeek } from '@prisma/client';

interface TimetableGrid {
    days: DayOfWeek[];
    periods: Array<{ id: number; name: string; startTime: string; endTime: string }>;
    cells: Record<string, Record<number, CellData>>;
}

interface CellData {
    subject?: string;
    teacher?: string;
    class?: string;
    section?: string;
    room?: string;
    isBreak?: boolean;
}

@Injectable()
export class TimetableExportService {
    constructor(private readonly prisma: PrismaService) { }

    private async formatTimetableGrid(
        entries: any[],
        periods: any[],
        forTeacher: boolean = false
    ): Promise<TimetableGrid> {
        const dayOrder: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
        const cells: Record<string, Record<number, CellData>> = {};

        // Initialize cells
        dayOrder.forEach(day => {
            cells[day] = {};
            periods.forEach(period => {
                cells[day][period.id] = { isBreak: period.type === 'BREAK' };
            });
        });

        // Fill with entries
        entries.forEach(entry => {
            if (!cells[entry.day]) cells[entry.day] = {};
            cells[entry.day][entry.periodId] = {
                subject: entry.subject?.name,
                teacher: forTeacher ? undefined : entry.teacher?.user?.name,
                class: forTeacher ? entry.class?.name : undefined,
                section: forTeacher ? entry.section?.name : undefined,
                room: entry.room?.name,
                isBreak: false,
            };
        });

        return {
            days: dayOrder.filter(day => Object.keys(cells[day] || {}).length > 0),
            periods: periods.sort((a, b) => a.startTime.localeCompare(b.startTime)),
            cells,
        };
    }

    async exportSectionPDF(schoolId: number, academicYearId: number, sectionId: number): Promise<Buffer> {
        // Fetch data
        const [section, entries, periods, school] = await Promise.all([
            this.prisma.section.findFirst({
                where: { id: sectionId, schoolId },
                include: { class: true },
            }),
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId, sectionId, status: { in: ['PUBLISHED', 'LOCKED'] } },
                include: {
                    subject: true,
                    teacher: { select: { user: { select: { name: true } } } },
                    period: true,
                    room: true,
                },
            }),
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId },
                orderBy: { startTime: 'asc' },
            }),
            this.prisma.school.findFirst({ where: { id: schoolId } }),
        ]);

        if (!section) throw new Error('Section not found');
        if (!school) throw new Error('School not found');

        const grid = await this.formatTimetableGrid(entries, periods, false);

        // Generate PDF
        return this.generatePDF(
            school.name,
            `Class Timetable - ${section.class.name} ${section.name}`,
            grid,
            false
        );
    }

    async exportTeacherPDF(schoolId: number, academicYearId: number, teacherId: number): Promise<Buffer> {
        const [teacher, entries, periods, school] = await Promise.all([
            this.prisma.teacherProfile.findFirst({
                where: { id: teacherId, schoolId },
                include: { user: true },
            }),
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId, teacherId, status: { in: ['PUBLISHED', 'LOCKED'] } },
                include: {
                    subject: true,
                    class: true,
                    section: true,
                    period: true,
                    room: true,
                },
            }),
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId },
                orderBy: { startTime: 'asc' },
            }),
            this.prisma.school.findFirst({ where: { id: schoolId } }),
        ]);

        if (!teacher) throw new Error('Teacher not found');
        if (!school) throw new Error('School not found');

        const grid = await this.formatTimetableGrid(entries, periods, true);

        return this.generatePDF(
            school.name,
            `Teacher Timetable - ${teacher.user.name}`,
            grid,
            true
        );
    }

    private generatePDF(schoolName: string, title: string, grid: TimetableGrid, forTeacher: boolean): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Header
            doc.fontSize(20).text(schoolName, { align: 'center' });
            doc.fontSize(14).text(title, { align: 'center' });
            doc.moveDown();

            // Table
            const cellWidth = 100;
            const cellHeight = 60;
            let x = 30;
            let y = doc.y;

            // Headers
            doc.fontSize(10).font('Helvetica-Bold');
            doc.rect(x, y, cellWidth, cellHeight).fill('#E5E7EB');
            doc.fillColor('#000').text('Day', x + 5, y + cellHeight / 2 - 5, { width: cellWidth - 10 });

            grid.periods.forEach((period, i) => {
                const px = x + cellWidth * (i + 1);
                doc.rect(px, y, cellWidth, cellHeight).fill('#E5E7EB');
                doc.fillColor('#000').text(period.name, px + 5, y + 5, { width: cellWidth - 10, align: 'center' });
                doc.fontSize(8).text(`${period.startTime}-${period.endTime}`, px + 5, y + 20, { width: cellWidth - 10, align: 'center' });
            });

            // Data rows
            y += cellHeight;
            doc.font('Helvetica');

            grid.days.forEach((day) => {
                doc.rect(x, y, cellWidth, cellHeight).stroke();
                doc.fontSize(10).text(day, x + 5, y + cellHeight / 2 - 5, { width: cellWidth - 10 });

                grid.periods.forEach((period, i) => {
                    const px = x + cellWidth * (i + 1);
                    const cell = grid.cells[day]?.[period.id];

                    if (cell?.isBreak) {
                        doc.rect(px, y, cellWidth, cellHeight).fill('#F3F4F6').stroke();
                        doc.fillColor('#000').fontSize(9).text('BREAK', px + 5, y + cellHeight / 2 - 5, { width: cellWidth - 10, align: 'center' });
                    } else if (cell?.subject) {
                        doc.rect(px, y, cellWidth, cellHeight).stroke();
                        doc.fontSize(9).text(cell.subject, px + 5, y + 5, { width: cellWidth - 10, align: 'center' });
                        const secondLine = forTeacher ? `${cell.class} ${cell.section}` : cell.teacher;
                        if (secondLine) {
                            doc.fontSize(7).text(secondLine, px + 5, y + 20, { width: cellWidth - 10, align: 'center' });
                        }
                    } else {
                        doc.rect(px, y, cellWidth, cellHeight).stroke();
                    }
                });

                y += cellHeight;
            });

            // Footer
            doc.fontSize(8).fillColor('#666').text(`Generated on ${new Date().toLocaleDateString()}`, 30, doc.page.height - 30);
            doc.text('Powered by Edulama', doc.page.width - 150, doc.page.height - 30);

            doc.end();
        });
    }

    async exportSectionExcel(schoolId: number, academicYearId: number, sectionId: number): Promise<Buffer> {
        const [section, entries, periods, school] = await Promise.all([
            this.prisma.section.findFirst({
                where: { id: sectionId, schoolId },
                include: { class: true },
            }),
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId, sectionId, status: { in: ['PUBLISHED', 'LOCKED'] } },
                include: {
                    subject: true,
                    teacher: { select: { user: { select: { name: true } } } },
                    period: true,
                    room: true,
                },
            }),
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId },
                orderBy: { startTime: 'asc' },
            }),
            this.prisma.school.findFirst({ where: { id: schoolId } }),
        ]);

        if (!section) throw new Error('Section not found');
        if (!school) throw new Error('School not found');

        const grid = await this.formatTimetableGrid(entries, periods, false);

        return this.generateExcel(
            school.name,
            `Class Timetable - ${section.class.name} ${section.name}`,
            grid,
            false
        );
    }

    async exportTeacherExcel(schoolId: number, academicYearId: number, teacherId: number): Promise<Buffer> {
        const [teacher, entries, periods, school] = await Promise.all([
            this.prisma.teacherProfile.findFirst({
                where: { id: teacherId, schoolId },
                include: { user: true },
            }),
            this.prisma.timetableEntry.findMany({
                where: { schoolId, academicYearId, teacherId, status: { in: ['PUBLISHED', 'LOCKED'] } },
                include: {
                    subject: true,
                    class: true,
                    section: true,
                    period: true,
                    room: true,
                },
            }),
            this.prisma.timePeriod.findMany({
                where: { schoolId, academicYearId },
                orderBy: { startTime: 'asc' },
            }),
            this.prisma.school.findFirst({ where: { id: schoolId } }),
        ]);

        if (!teacher) throw new Error('Teacher not found');
        if (!school) throw new Error('School not found');

        const grid = await this.formatTimetableGrid(entries, periods, true);

        return this.generateExcel(
            school.name,
            `Teacher Timetable - ${teacher.user.name}`,
            grid,
            true
        );
    }

    private async generateExcel(schoolName: string, title: string, grid: TimetableGrid, forTeacher: boolean): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Timetable');

        // Header
        worksheet.mergeCells('A1', `${String.fromCharCode(65 + grid.periods.length)}1`);
        worksheet.getCell('A1').value = schoolName;
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        worksheet.mergeCells('A2', `${String.fromCharCode(65 + grid.periods.length)}2`);
        worksheet.getCell('A2').value = title;
        worksheet.getCell('A2').font = { size: 12, bold: true };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };

        // Column headers
        const headerRow = worksheet.getRow(4);
        headerRow.getCell(1).value = 'Day';
        grid.periods.forEach((period, i) => {
            headerRow.getCell(i + 2).value = `${period.name}\n${period.startTime}-${period.endTime}`;
        });
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        headerRow.height = 40;

        // Data rows
        let rowIndex = 5;
        grid.days.forEach((day) => {
            const row = worksheet.getRow(rowIndex);
            row.getCell(1).value = day;

            grid.periods.forEach((period, i) => {
                const cell = grid.cells[day]?.[period.id];
                const excelCell = row.getCell(i + 2);

                if (cell?.isBreak) {
                    excelCell.value = 'BREAK';
                    excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                } else if (cell?.subject) {
                    excelCell.value = forTeacher
                        ? `${cell.subject}\n${cell.class} ${cell.section}`
                        : `${cell.subject}\n${cell.teacher}`;
                } else {
                    excelCell.value = '';
                }

                excelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            });

            row.height = 50;
            rowIndex++;
        });

        // Borders
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber >= 4) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' },
                    };
                });
            }
        });

        // Column widths
        worksheet.getColumn(1).width = 15;
        grid.periods.forEach((_, i) => {
            worksheet.getColumn(i + 2).width = 20;
        });

        return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    }
}
