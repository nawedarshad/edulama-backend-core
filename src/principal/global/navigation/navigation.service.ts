import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NavigationService {
    private readonly logger = new Logger(NavigationService.name);

    constructor(private readonly prisma: PrismaService) {}

    async getMenus(schoolId: number) {
        return this.prisma.webMenu.findMany({
            where: { schoolId },
            include: {
                items: {
                    orderBy: { order: 'asc' }
                }
            }
        });
    }

    async createMenu(schoolId: number, data: { name: string; location: string }) {
        return this.prisma.webMenu.create({
            data: {
                ...data,
                schoolId
            },
            include: { items: true }
        });
    }

    async updateMenu(schoolId: number, menuId: number, data: any) {
        const { items, name, location } = data;

        // Verify ownership
        const menu = await this.prisma.webMenu.findFirst({
            where: { id: menuId, schoolId }
        });

        if (!menu) throw new NotFoundException('Menu not found');

        return this.prisma.$transaction(async (tx) => {
            // Update main menu info
            await tx.webMenu.update({
                where: { id: menuId },
                data: { name, location }
            });

            // Handle items: simple approach is to delete all and recreate for small menus,
            // or perform a diff. For simplicity and robustness with drag-and-drop:
            if (items) {
                // Delete existing items
                await tx.webMenuItem.deleteMany({ where: { menuId } });

                // Create new items
                // Note: We need to handle parentId carefully if nested menus are used.
                // For now, flattening based on the incoming array order.
                await tx.webMenuItem.createMany({
                    data: items.map((item: any, index: number) => ({
                        menuId,
                        label: item.label,
                        type: item.type,
                        value: item.value,
                        target: item.target || '_self',
                        order: index,
                        // parentId handling would go here if needed
                    }))
                });
            }

            return tx.webMenu.findUnique({
                where: { id: menuId },
                include: { items: { orderBy: { order: 'asc' } } }
            });
        });
    }

    async deleteMenu(schoolId: number, menuId: number) {
        const menu = await this.prisma.webMenu.findFirst({
            where: { id: menuId, schoolId }
        });

        if (!menu) throw new NotFoundException('Menu not found');

        return this.prisma.webMenu.delete({ where: { id: menuId } });
    }
}
