import { Module, MiddlewareConsumer, RequestMethod, NestModule } from '@nestjs/common';
import { RouteLoggerMiddleware } from './common/middleware/route-logger.middleware';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { PrincipalModule } from './principal/principal.module';
import { TeacherModule } from './teacher/teacher.module';
import { ParentModule } from './parent/parent.module';
import { StudentModule } from './student/student.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { AuditLogModule } from './common/audit/audit-log.module';
import { TodoModule } from './todo/todo.module';
import { SaaSAdminModule } from './saas-admin/saas-admin.module';
import { UserModule } from './user/user.module';
import { ExamModule } from './exam/exam.module';
import { WebPageModule } from './web-page/web-page.module';
import { SchoolConfigController } from './common/school-config.controller';
import { SaasAdminCbseCircularModule } from './saas-admin/cbse-circular/saas-admin-cbse-circular.module';
import { PrincipalCbseCircularModule } from './principal/cbse-circular/principal-cbse-circular.module';
import { InquiryModule } from './principal/inquiry/inquiry.module';
import { PublicInquiryController } from './principal/inquiry/public-inquiry.controller';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AdminModule,
    PrincipalModule,
    TeacherModule,
    ParentModule,
    StudentModule,
    AuditLogModule,
    TodoModule,
    SaaSAdminModule,
    UserModule,
    ExamModule,
    SaasAdminCbseCircularModule,
    PrincipalCbseCircularModule,
    EventEmitterModule.forRoot(),
    HttpModule,
    WebPageModule,
    InquiryModule,
  ],
  controllers: [AppController, SchoolConfigController, PublicInquiryController],
  providers: [
    AppService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RouteLoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

