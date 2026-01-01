
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const { method, originalUrl, body, headers } = req;
        const userAgent = req.get('user-agent') || '';

        this.logger.log(
            `Incoming Request: ${method} ${originalUrl} - User-Agent: ${userAgent}`,
        );

        // items to debug
        // items to debug
        if (body && Object.keys(body).length > 0) {
            this.logger.debug(`Request Body: ${JSON.stringify(body)}`);
        }

        this.logger.debug(`Auth Header: ${headers.authorization ? 'Present' : 'Missing'}`);

        const start = Date.now();
        res.on('finish', () => {
            const { statusCode } = res;
            const contentLength = res.get('content-length');
            const duration = Date.now() - start;
            this.logger.log(
                `Response: ${method} ${originalUrl} ${statusCode} ${contentLength} - ${duration}ms`,
            );
        });

        next();
    }
}
