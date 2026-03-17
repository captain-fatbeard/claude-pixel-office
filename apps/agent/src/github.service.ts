import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WeeklyCommits {
  days: { label: string; count: number }[];
  total: number;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly username: string;
  private cached: (WeeklyCommits & { fetchedAt: number }) | null = null;

  constructor(private config: ConfigService) {
    this.username = this.config.get<string>('GITHUB_USERNAME', '');
  }

  async getWeeklyCommits(): Promise<WeeklyCommits> {
    if (this.cached && Date.now() - this.cached.fetchedAt < 2 * 60 * 1000) {
      return this.cached;
    }

    if (!this.username) {
      return { days: [], total: 0 };
    }

    try {
      const now = new Date();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days: { label: string; count: number }[] = [];
      const dateToIdx = new Map<string, number>();
      const dayOfWeek = now.getDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      for (let i = 0; i <= daysSinceMonday; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - daysSinceMonday + i);
        const dateStr = d.toISOString().split('T')[0];
        days.push({ label: dayNames[d.getDay()], count: 0 });
        dateToIdx.set(dateStr, i);
      }

      const res = await fetch(
        `https://github.com/users/${this.username}/contributions`,
        { headers: { 'User-Agent': 'claude-pixel-office-agent' } },
      );
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      const html = await res.text();

      const cellRegex =
        /data-date="(\d{4}-\d{2}-\d{2})" id="(contribution-day-component-[^"]+)"/g;
      const cellIds = new Map<string, string>();
      let match: RegExpExecArray | null;
      while ((match = cellRegex.exec(html)) !== null) {
        cellIds.set(match[2], match[1]);
      }

      const tipRegex =
        /for="(contribution-day-component-[^"]+)"[^>]*>([^<]+)</g;
      while ((match = tipRegex.exec(html)) !== null) {
        const cellId = match[1];
        const tipText = match[2].trim();
        const date = cellIds.get(cellId);
        if (!date) continue;
        const idx = dateToIdx.get(date);
        if (idx === undefined) continue;
        const countMatch = tipText.match(/^(\d+) contribution/);
        if (countMatch) days[idx].count = parseInt(countMatch[1], 10);
      }

      const total = days.reduce((sum, d) => sum + d.count, 0);
      this.cached = { days, total, fetchedAt: Date.now() };
      return { days, total };
    } catch (err) {
      this.logger.error('Error fetching GitHub contributions', err);
      return this.cached
        ? { days: this.cached.days, total: this.cached.total }
        : { days: [], total: 0 };
    }
  }
}
