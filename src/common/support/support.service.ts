import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePlatformSupportTicketDto } from './dto/create-support-ticket.dto';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupportService {
    private readonly logger = new Logger(SupportService.name);
    private transporter: nodemailer.Transporter;

    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) {
        // Initialize nodemailer with config (similar to edulama-auth)
        const host = this.config.get<string>('MAIL_HOST');
        const port = this.config.get<number>('MAIL_PORT');
        const user = this.config.get<string>('MAIL_USER');
        const pass = this.config.get<string>('MAIL_PASSWORD');

        if (host && port && user && pass) {
            this.transporter = nodemailer.createTransport({
                host,
                port: Number(port),
                secure: Number(port) === 465,
                auth: { user, pass },
            });
        }
    }

    async createTicket(dto: CreatePlatformSupportTicketDto) {
        // 1. Save to ContactInquiry (as scheduled in plan)
        const ticket = await this.prisma.contactInquiry.create({
            data: {
                name: dto.name || 'Anonymous',
                email: dto.email || 'no-email@provided.com',
                phone: dto.phone,
                schoolName: dto.schoolName,
                message: `${dto.title}\n\n${dto.description}`,
                status: 'pending',
            },
        });

        // 2. Fetch help support email from PlatformSettings
        const helpEmails = await this.prisma.platformSetting.findMany({
            where: { key: 'HELP_SUPPORT_EMAIL' },
        });

        // 3. Send email if configured
        if (this.transporter && helpEmails.length > 0) {
            const recipients = helpEmails.map(s => s.value).join(', ');
            const fromEmail = this.config.get<string>('MAIL_FROM') || 'support@edulama.com';

            try {
                await this.transporter.sendMail({
                    from: `"EduLama Support" <${fromEmail}>`,
                    to: recipients,
                    subject: `New Support Ticket: ${dto.title}`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                            <h2 style="color: #000; border-bottom: 2px solid #eee; padding-bottom: 10px;">New Support Inquiry Received</h2>
                            
                            <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin-top: 20px;">
                                <p><strong>Subject:</strong> ${dto.title}</p>
                                <p><strong>Full Description:</strong><br/>${dto.description.replace(/\n/g, '<br/>')}</p>
                            </div>

                            <div style="margin-top: 30px; line-height: 1.6;">
                                <h3 style="font-size: 16px; margin-bottom: 10px; color: #666;">Contact Details:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Name:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dto.name || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Email:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dto.email || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dto.phone || 'N/A'}</td>
                                    </tr>
                                    ${dto.schoolName ? `
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>School Name:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dto.schoolName}</td>
                                    </tr>` : ''}
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${ticket.id}</td>
                                    </tr>
                                </table>
                            </div>

                            <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">
                                This is an automated notification from the EduLama Platform Support System.
                            </p>
                        </div>
                    `,
                });
                this.logger.log(`Support email sent to ${recipients}`);
            } catch (error) {
                this.logger.error(`Failed to send support email: ${error.message}`);
            }
        }

        return ticket;
    }
}
