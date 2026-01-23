import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*', // Allow all origins for now
    },
    namespace: 'notifications'
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('NotificationGateway');

    // Map userId to socketId(s)
    private userSockets: Map<string, string[]> = new Map();

    afterInit(server: Server) {
        this.logger.log('Notification Gateway initialized');
    }

    handleConnection(client: Socket) {
        // Authenticate client using query param or header
        // For simplicity, let's assume client sends userId in query: ?userId=123
        // In production, verify JWT token here.
        const userId = client.handshake.query.userId as string;

        if (userId) {
            this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
            const sockets = this.userSockets.get(userId) || [];
            sockets.push(client.id);
            this.userSockets.set(userId, sockets);

            // Join a room named after the userId for easier broadcasting
            client.join(`user_${userId}`);
        } else {
            this.logger.log(`Client connected without userId: ${client.id}`);
        }
    }

    handleDisconnect(client: Socket) {
        const userId = client.handshake.query.userId as string;
        if (userId) {
            this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
            let sockets = this.userSockets.get(userId) || [];
            sockets = sockets.filter(id => id !== client.id);
            if (sockets.length === 0) {
                this.userSockets.delete(userId);
            } else {
                this.userSockets.set(userId, sockets);
            }
        }
    }

    sendToUser(userId: number, event: string, data: any) {
        const roomName = `user_${userId}`;
        // this.logger.log(`Sending ${event} to user ${userId} (Room: ${roomName})`);
        this.server.to(roomName).emit(event, data);
    }
}
