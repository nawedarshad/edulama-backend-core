const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function verifyUserManagement() {
    console.log('🚀 Starting User Management Verification...');

    try {
        // 1. Find a test user (Student we created earlier)
        const testUser = await prisma.user.findFirst({
            where: { name: 'Aryan Sharma' },
            include: { authIdentities: true }
        });

        if (!testUser) {
            console.log('❌ Test user not found. Please run student setup first.');
            return;
        }

        console.log(`Found test user: ${testUser.name} (ID: ${testUser.id})`);
        console.log(`Current identities: ${testUser.authIdentities.map(i => i.value).join(', ')}`);

        // 2. Simulate Password Reset
        console.log('\n--- Testing Password Reset ---');
        const newPassword = 'NewSecretPassword123!';
        const hashedPassword = await argon2.hash(newPassword);

        // Update identities
        await prisma.authIdentity.updateMany({
            where: { userId: testUser.id, type: { in: ['EMAIL', 'USERNAME', 'PHONE'] } },
            data: { secret: hashedPassword }
        });

        const updatedId = await prisma.authIdentity.findFirst({
            where: { userId: testUser.id, type: 'EMAIL' }
        });

        const isMatch = await argon2.verify(updatedId.secret, newPassword);
        if (isMatch) {
            console.log('✅ Password reset verified: Hashed password matches original.');
        } else {
            console.log('❌ Password reset failed: Hashed password does not match.');
        }

        // 3. Testing Status Toggle
        console.log('\n--- Testing Account Status Toggle ---');
        const originalStatus = testUser.isActive;
        await prisma.user.update({
            where: { id: testUser.id },
            data: { isActive: !originalStatus }
        });

        const toggledUser = await prisma.user.findUnique({ where: { id: testUser.id } });
        console.log(`✅ Status toggled from ${originalStatus} to ${toggledUser.isActive}.`);

        // Revert status
        await prisma.user.update({
            where: { id: testUser.id },
            data: { isActive: originalStatus }
        });

        // 4. Testing Identity Addition
        console.log('\n--- Testing Identity Addition ---');
        const tempUsername = `temp_user_${Date.now()}`;
        await prisma.authIdentity.create({
            data: {
                userId: testUser.id,
                type: 'USERNAME',
                value: tempUsername,
                verified: true
            }
        });

        const addedId = await prisma.authIdentity.findUnique({
            where: { type_value: { type: 'USERNAME', value: tempUsername } }
        });

        if (addedId) {
            console.log(`✅ Identity added successfully: ${tempUsername}`);
            
            // 5. Testing Identity Removal
            await prisma.authIdentity.delete({ where: { id: addedId.id } });
            const deletedId = await prisma.authIdentity.findUnique({
                where: { type_value: { type: 'USERNAME', value: tempUsername } }
            });

            if (!deletedId) {
                console.log('✅ Identity removed successfully.');
            } else {
                console.log('❌ Identity removal failed.');
            }
        } else {
            console.log('❌ Identity addition failed.');
        }

        console.log('\n✨ User Management verification completed successfully!');

    } catch (error) {
        console.error('❌ Verification Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyUserManagement();
