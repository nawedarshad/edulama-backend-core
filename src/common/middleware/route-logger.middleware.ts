import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RouteLoggerMiddleware implements NestMiddleware {
    private logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        this.logger.log(`Incoming request: ${req.method} ${req.originalUrl}`);

        // Log router stack to see what routes are registered
        // slightly hacky but useful for debugging 404s in express
        if ((req as any).app && (req as any).app._router && (req as any).app._router.stack) {
            // This might be too verbose, so maybe just log the request for now.
        }

        next();
    }
}
