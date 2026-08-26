import { Injectable } from "@nestjs/common";

@Injectable()
export class ServerClock {
  now(): Date {
    return new Date();
  }
}
