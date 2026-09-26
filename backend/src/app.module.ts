import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { AuthModule } from "./auth/auth.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { PermissionsGuard } from "./auth/permissions.guard";
import { SessionAuthGuard } from "./auth/session-auth.guard";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";
import { NoStoreInterceptor } from "./common/http/no-store.interceptor";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { OrganizationModule } from "./organization/organization.module";
import { OpenApiModule } from "./openapi/openapi.module";
import { UsersModule } from "./users/users.module";
import { StorageModule } from "./storage/storage.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AcademicModule } from "./academic/academic.module";
import { DocumentsModule } from "./documents/documents.module";
import { KairosModule } from "./kairos/kairos.module";
import { DirectoryModule } from "./directory/directory.module";
import { ReportsModule } from "./reports/reports.module";
import { LibraryModule } from "./library/library.module";
import { PublicContentModule } from "./public-content/public-content.module";
import { GamificationModule } from "./gamification/gamification.module";
import { Printing3dModule } from "./printing-3d/printing-3d.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../.env"],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    AttendanceModule,
    HealthModule,
    OrganizationModule,
    UsersModule,
    StorageModule,
    InvitationsModule,
    NotificationsModule,
    AcademicModule,
    DocumentsModule,
    KairosModule,
    DirectoryModule,
    ReportsModule,
    LibraryModule,
    PublicContentModule,
    GamificationModule,
    Printing3dModule,
    OpenApiModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
