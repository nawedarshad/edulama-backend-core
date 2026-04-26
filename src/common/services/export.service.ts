import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PDFDocument = require('pdfkit');
import { Response } from 'express';
import axios from 'axios';

@Injectable()
export class ExportService {
    private readonly logger = new Logger(ExportService.name);

    constructor(private prisma: PrismaService) { }

    async generateMinimalPdfReport(
        schoolId: number,
        title: string,
        headers: string[],
        rows: string[][],
        res: Response
    ): Promise<void> {
        this.logger.debug(`Generating Minimalist PDF for school ${schoolId}`);

        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
        });

        const doc = new PDFDocument({ 
            size: 'A4', 
            margin: 50,
            bufferPages: true,
            autoFirstPage: true
        });

        const chunks: any[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const result = Buffer.concat(chunks);
                if (!res.headersSent) {
                    res.setHeader('Content-Length', result.length);
                    res.send(result);
                }
                resolve();
            });

            doc.on('error', (err) => reject(err));

            try {
                doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFFFFF');
                let y = 50;
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#86868B').text(school?.name || 'INSTITUTION', 50, y);
                y += 20;
                doc.font('Helvetica-Bold').fontSize(22).fillColor('#1D1D1F').text(title, 50, y);
                y += 35;
                doc.font('Helvetica').fontSize(9).fillColor('#86868B').text(`Generated ${new Date().toLocaleDateString()} | ${new Date().toLocaleTimeString()}`, 50, y);
                y += 30;
                
                const pageWidth = doc.page.width - 100;
                const colWidth = pageWidth / headers.length;
                
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F');
                let currentX = 50;
                headers.forEach(header => {
                    doc.text(header.toUpperCase(), currentX, y, { width: colWidth - 5, align: 'left' });
                    currentX += colWidth;
                });
                
                y += 18;
                doc.strokeColor('#E5E5EA').lineWidth(0.5).moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
                y += 15;
                
                doc.font('Helvetica').fontSize(8.5).fillColor('#3A3A3C');
                for (const row of rows) {
                    if (y > 750) {
                        doc.addPage();
                        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFFFFF');
                        y = 50;
                        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F');
                        let tempX = 50;
                        headers.forEach(header => {
                            doc.text(header.toUpperCase(), tempX, y, { width: colWidth - 5, align: 'left' });
                            tempX += colWidth;
                        });
                        y += 18;
                        doc.strokeColor('#E5E5EA').lineWidth(0.5).moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
                        y += 15;
                        doc.font('Helvetica').fontSize(8.5).fillColor('#3A3A3C');
                    }
                    currentX = 50;
                    row.forEach(cell => {
                        doc.text(String(cell || '—'), currentX, y, { width: colWidth - 5, align: 'left', ellipsis: true });
                        currentX += colWidth;
                    });
                    y += 20;
                }
                
                const total = doc.bufferedPageRange().count;
                for (let i = 0; i < total; i++) {
                    doc.switchToPage(i);
                    doc.font('Helvetica').fontSize(7).fillColor('#C6C6C8').text(`Page ${i + 1} of ${total} — Edulama Core`, 50, doc.page.height - 35, { align: 'center', width: doc.page.width - 100 });
                }
                doc.end();
            } catch (err) { reject(err); }
        });
    }

    async generateDetailedDepartmentReport(
        schoolId: number,
        dept: any,
        res: Response
    ): Promise<void> {
        this.logger.debug(`Generating Detailed PDF for Department ${dept.name}`);

        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            include: { schoolSettings: true }
        });

        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        const chunks: any[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        return new Promise(async (resolve, reject) => {
            doc.on('end', () => {
                const result = Buffer.concat(chunks);
                if (!res.headersSent) {
                    res.setHeader('Content-Length', result.length);
                    res.send(result);
                }
                resolve();
            });
            doc.on('error', (err) => reject(err));

            try {
                // Background & Header Bar
                doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FAFAFA');
                doc.rect(0, 0, doc.page.width, 4).fill('#007AFF');

                // --- 1. OVERVIEW PAGE ---
                let y = 60;
                const logoUrl = school?.schoolSettings?.logoUrl;
                if (logoUrl?.startsWith('http')) {
                    try {
                        const lRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 3000 });
                        doc.image(Buffer.from(lRes.data), 50, y, { width: 30, height: 30 });
                    } catch(e) {}
                }
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#86868B').text(school?.name || 'INSTITUTION', 90, y + 10);
                
                y += 60;
                doc.font('Helvetica-Bold').fontSize(32).fillColor('#1D1D1F').text(dept.name, 50, y);
                doc.font('Helvetica').fontSize(14).fillColor('#007AFF').text(`Department of ${dept.type.replace('_', ' ')}`, 50, y + 38);
                
                y += 80;
                if (dept.description) {
                    doc.rect(50, y, 495, 60).fill('#FFFFFF').strokeColor('#E5E5EA').lineWidth(0.5).stroke();
                    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#3A3A3C').text(dept.description, 65, y + 15, { width: 465 });
                    y += 80;
                }

                const cards = [
                    { label: 'FACULTY MEMBERS', value: dept._count.members, color: '#34C759' },
                    { label: 'ACTIVE SUBJECTS', value: dept._count.subjects, color: '#AF52DE' },
                    { label: 'DEPT CODE', value: dept.code, color: '#FF9500' }
                ];
                cards.forEach((c, i) => {
                    const x = 50 + (i * 170);
                    doc.rect(x, y, 155, 60).fill('#FFFFFF').strokeColor('#E5E5EA').lineWidth(0.5).stroke();
                    doc.font('Helvetica-Bold').fontSize(8).fillColor('#86868B').text(c.label, x + 12, y + 15);
                    doc.font('Helvetica-Bold').fontSize(22).fillColor(c.color).text(String(c.value), x + 12, y + 28);
                });
                y += 90;

                doc.font('Helvetica-Bold').fontSize(14).fillColor('#1D1D1F').text('Department Leadership', 50, y);
                y += 25;
                doc.rect(50, y, 495, 80).fill('#F2F2F7').strokeColor('#E5E5EA').lineWidth(0.5).stroke();
                if (dept.headUser) {
                    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1D1D1F').text(dept.headUser.name, 70, y + 20);
                    doc.font('Helvetica').fontSize(10).fillColor('#86868B').text('Head of Department', 70, y + 38);
                    const headEmail = dept.headUser.teacherProfile?.personalInfo?.email || '';
                    doc.font('Helvetica').fontSize(10).fillColor('#007AFF').text(headEmail, 70, y + 52);
                } else {
                    doc.font('Helvetica').fontSize(11).fillColor('#86868B').text('No Head currently assigned.', 70, y + 32);
                }

                // --- 2. FACULTY LIST ---
                doc.addPage();
                doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FAFAFA');
                doc.rect(0, 0, doc.page.width, 4).fill('#34C759');
                y = 60;
                doc.font('Helvetica-Bold').fontSize(18).fillColor('#1D1D1F').text('Teaching Faculty', 50, y);
                y += 35;
                const fHeaders = ['Name', 'Email', 'Emp Code', 'Designation'];
                const fCols = [140, 160, 80, 115];
                doc.rect(50, y, 495, 25).fill('#F2F2F7');
                let curX = 50;
                fHeaders.forEach((h, i) => {
                    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F').text(h, curX + 5, y + 8);
                    curX += fCols[i];
                });
                y += 25;
                dept.members.forEach((m: any, i: number) => {
                    if (y > 750) { 
                        doc.addPage(); 
                        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FAFAFA'); 
                        y = 50;
                        doc.rect(50, y, 495, 25).fill('#F2F2F7');
                        let tx = 50;
                        fHeaders.forEach((h, idx) => {
                            doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F').text(h, tx + 5, y + 8);
                            tx += fCols[idx];
                        });
                        y += 25;
                    }
                    if (i % 2 === 1) doc.rect(50, y, 495, 22).fill('#F9F9FB');
                    let rowX = 50;
                    const u = m.user;
                    const tp = u?.teacherProfile as any;
                    const cells = [u.name, tp?.personalInfo?.email || '—', tp?.empCode || '—', tp?.designation || 'Teacher'];
                    cells.forEach((c, idx) => {
                        doc.font('Helvetica').fontSize(8.5).fillColor('#3A3A3C').text(String(c || '—'), rowX + 5, y + 7, { width: fCols[idx] - 10, ellipsis: true });
                        rowX += fCols[idx];
                    });
                    y += 22;
                });

                // --- 3. SUBJECTS LIST ---
                if (dept.subjects?.length > 0) {
                    doc.addPage();
                    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FAFAFA');
                    doc.rect(0, 0, doc.page.width, 4).fill('#AF52DE');
                    y = 60;
                    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1D1D1F').text('Curriculum & Subjects', 50, y);
                    y += 35;
                    const sHeaders = ['Code', 'Subject Name'];
                    const sCols = [100, 395];
                    doc.rect(50, y, 495, 25).fill('#F2F2F7');
                    let sX = 50;
                    sHeaders.forEach((h, i) => {
                        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F').text(h, sX + 5, y + 8);
                        sX += sCols[i];
                    });
                    y += 25;
                    dept.subjects.forEach((s: any, i: number) => {
                        if (y > 750) { 
                            doc.addPage(); 
                            doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FAFAFA'); 
                            y = 50; 
                            doc.rect(50, y, 495, 25).fill('#F2F2F7');
                            let tSx = 50;
                            sHeaders.forEach((h, idx) => {
                                doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F').text(h, tSx + 5, y + 8);
                                tSx += sCols[idx];
                            });
                            y += 25;
                        }
                        if (i % 2 === 1) doc.rect(50, y, 495, 22).fill('#F9F9FB');
                        doc.font('Helvetica-Bold').fontSize(9).fillColor('#007AFF').text(s.code, 55, y + 7);
                        doc.font('Helvetica').fontSize(9).fillColor('#1D1D1F').text(s.name, 155, y + 7);
                        y += 22;
                    });
                }

                const total = doc.bufferedPageRange().count;
                for (let i = 0; i < total; i++) {
                    doc.switchToPage(i);
                    doc.font('Helvetica').fontSize(7).fillColor('#AEAEB2').text(
                        `Department Detail Report — Generated by Edulama Core — Page ${i + 1} of ${total}`,
                        50, doc.page.height - 35, { align: 'center' }
                    );
                }
                doc.end();
            } catch (err) { reject(err); }
        });
    }

    private drawFallbackLogo(doc: any, x: number, y: number, name?: string) {
        doc.fillColor('#007AFF').circle(x + 15, y + 15, 15).fill();
        doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text(name?.[0] || 'S', x + 10, y + 10);
    }
}
