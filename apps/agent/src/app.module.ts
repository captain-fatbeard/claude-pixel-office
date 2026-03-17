import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ScannerService } from './scanner.service';
import { GithubService } from './github.service';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
  ],
  providers: [ScannerService, GithubService, WebhookService],
})
export class AppModule {}
