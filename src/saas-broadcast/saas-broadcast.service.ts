import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaasBroadcastDto, UpdateSaasBroadcastDto } from './dto/broadcast.dto';

@Injectable()
export class SaasBroadcastService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaasBroadcastDto) {
    return this.prisma.saasBroadcast.create({
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async findAll(activeOnly = false, schoolId?: number) {
    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }
    
    // If schoolId is provided, find broadcasts targeted to this school OR all schools
    if (schoolId) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { targetSchools: { has: schoolId } },
            { targetSchools: { isEmpty: true } },
          ],
        },
      ];
    }

    return this.prisma.saasBroadcast.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveForSchool(schoolId: number) {
    return this.prisma.saasBroadcast.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        AND: [
          {
            OR: [
              { targetSchools: { has: schoolId } },
              { targetSchools: { isEmpty: true } },
            ],
          },
        ],
      },
      orderBy: [
        { priority: 'desc' }, // URGENT first
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: number) {
    const broadcast = await this.prisma.saasBroadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return broadcast;
  }

  async update(id: number, dto: UpdateSaasBroadcastDto) {
    await this.findOne(id);
    return this.prisma.saasBroadcast.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.saasBroadcast.delete({ where: { id } });
  }

  async toggleStatus(id: number, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.saasBroadcast.update({
      where: { id },
      data: { isActive },
    });
  }
}
