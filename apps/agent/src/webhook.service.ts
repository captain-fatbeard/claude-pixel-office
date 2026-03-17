import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ScannerService } from './scanner.service';
import { GithubService } from './github.service';

@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookUrl: string;
  private readonly username: string;
  private lastSnapshot = '';

  constructor(
    private config: ConfigService,
    private scanner: ScannerService,
    private github: GithubService,
  ) {
    this.webhookUrl = this.config.get<string>(
      'WEBHOOK_URL',
      'http://localhost:3000/api/webhook',
    );
    this.username = this.config.get<string>('GITHUB_USERNAME', '');
  }

  onModuleInit() {
    if (!this.username) {
      this.logger.warn('GITHUB_USERNAME is not set — agent will not post');
      return;
    }
    this.logger.log(`User: ${this.username}`);
    this.logger.log(`Webhook: ${this.webhookUrl}`);
    this.postUpdate();
  }

  @Interval(2000)
  async postUpdate() {
    if (!this.username) return;

    try {
      const agents = this.scanner.discoverAgents();
      const commits = await this.github.getWeeklyCommits();

      const payload = {
        username: this.username,
        agents,
        commits,
      };

      const snapshot = JSON.stringify(payload);
      if (snapshot === this.lastSnapshot) return;
      this.lastSnapshot = snapshot;

      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: snapshot,
      });

      if (!res.ok) {
        this.logger.error(
          `Webhook POST failed: ${res.status} ${res.statusText}`,
        );
      }
    } catch (err) {
      this.logger.error('Error posting update', err);
    }
  }

  @Interval(15000)
  forceNextPost() {
    this.lastSnapshot = '';
  }
}
