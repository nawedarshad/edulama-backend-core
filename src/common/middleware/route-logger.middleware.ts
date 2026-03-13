import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RouteLoggerMiddleware implements NestMiddleware {
    private logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        this.logger.log(`Incoming request: ${req.method} ${req.originalUrl}`);
        
        if (req.body && Object.keys(req.body).length > 0) {
            this.logger.debug(`Body: ${JSON.stringify(req.body)}`);
        } else if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
            this.logger.warn(`Empty body on ${req.method} request!`);
        }

        next();
    }
}
