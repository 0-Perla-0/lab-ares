import { Injectable, type OnModuleInit } from "@nestjs/common";
import { passwordDenyHashes } from "./password-denylist";

@Injectable()
export class PasswordPolicyBootstrap implements OnModuleInit {
  onModuleInit() {
    passwordDenyHashes();
  }
}
