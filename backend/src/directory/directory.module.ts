import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
@Module({imports:[AuthModule],controllers:[DirectoryController],providers:[DirectoryService]}) export class DirectoryModule {}
