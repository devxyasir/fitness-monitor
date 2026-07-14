import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { Clip, PoseKeypointFrame } from '../database/entities/others.entities';
import type {
  CoachOverviewClip,
  CoachOverviewResponse,
  CoachOverviewSession,
  CoachStudentSummary,
  DashboardRange,
  StudentOverviewResponse,
} from './dashboard.dto';

const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(SessionParticipant) private readonly participantRepo: Repository<SessionParticipant>,
    @InjectRepository(Clip) private readonly clipRepo: Repository<Clip>,
    @InjectRepository(PoseKeypointFrame) private readonly poseFrameRepo: Repository<PoseKeypointFrame>,
  ) {}

  private rangeStart(range: DashboardRange): Date {
    const days = RANGE_DAYS[range] ?? 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  /** Buckets a count-per-day series into `weeks` weekly totals, oldest first. */
  private bucketWeekly(rows: { day: Date; value: number }[], since: Date, weeks: number): number[] {
    const buckets = new Array(weeks).fill(0);
    const sinceMs = since.getTime();
    for (const row of rows) {
      const idx = Math.min(weeks - 1, Math.floor((row.day.getTime() - sinceMs) / WEEK_MS));
      if (idx >= 0) buckets[idx] += row.value;
    }
    return buckets;
  }

  async getCoachOverview(coachId: string, range: DashboardRange): Promise<CoachOverviewResponse> {
    const since = this.rangeStart(range);
    const weeks = Math.max(1, Math.ceil(RANGE_DAYS[range] / 7));

    const [sessionsHosted, activeStudentsRaw, replayClipsSaved, accuracyRaw, liveAndUpcoming, recentClipsRaw, sessionsByDay, accuracyByDay] =
      await Promise.all([
        this.sessionRepo
          .createQueryBuilder('s')
          .where('s.coach_id = :coachId', { coachId })
          .andWhere('s.scheduled_at >= :since', { since })
          .getCount(),
        this.participantRepo
          .createQueryBuilder('p')
          .innerJoin('p.session', 's')
          .select('COUNT(DISTINCT p.user_id)', 'count')
          .where('s.coach_id = :coachId', { coachId })
          .andWhere("p.role_in_session = 'student'")
          .andWhere('s.scheduled_at >= :since', { since })
          .getRawOne<{ count: string }>(),
        this.clipRepo
          .createQueryBuilder('c')
          .where('c.created_by = :coachId', { coachId })
          .andWhere('c.created_at >= :since', { since })
          .getCount(),
        this.poseFrameRepo
          .createQueryBuilder('pkf')
          .innerJoin('pkf.recording', 'r')
          .innerJoin('r.session', 's')
          .select('AVG(pkf.confidence_avg)', 'avg')
          .where('s.coach_id = :coachId', { coachId })
          .andWhere('s.scheduled_at >= :since', { since })
          .getRawOne<{ avg: string | null }>(),
        this.sessionRepo
          .createQueryBuilder('s')
          .loadRelationCountAndMap('s.participantCount', 's.participants', 'p', (qb) =>
            qb.andWhere("p.status = 'approved'"),
          )
          .where('s.coach_id = :coachId', { coachId })
          .andWhere(
            "(s.status = 'live' OR (s.status = 'scheduled' AND s.scheduled_at <= :soon))",
            { soon: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          )
          .orderBy('s.scheduled_at', 'ASC')
          .limit(5)
          .getMany(),
        this.clipRepo.find({
          where: { createdBy: coachId } as any,
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.sessionRepo
          .createQueryBuilder('s')
          .select("date_trunc('day', s.scheduled_at)", 'day')
          .addSelect('COUNT(*)', 'value')
          .where('s.coach_id = :coachId', { coachId })
          .andWhere('s.scheduled_at >= :since', { since })
          .groupBy('day')
          .getRawMany<{ day: Date; value: string }>(),
        this.poseFrameRepo
          .createQueryBuilder('pkf')
          .innerJoin('pkf.recording', 'r')
          .innerJoin('r.session', 's')
          .select("date_trunc('day', r.created_at)", 'day')
          .addSelect('AVG(pkf.confidence_avg) * 100', 'value')
          .where('s.coach_id = :coachId', { coachId })
          .andWhere('s.scheduled_at >= :since', { since })
          .groupBy('day')
          .getRawMany<{ day: Date; value: string }>(),
      ]);

    const liveSessions: CoachOverviewSession[] = liveAndUpcoming.map((s) => ({
      id: s.id,
      title: `Session ${s.id.substring(0, 8)}`,
      datetime: (s.startedAt ?? s.scheduledAt).toISOString(),
      participants: (s as unknown as { participantCount: number }).participantCount ?? 0,
      status: s.status === 'live' ? 'Live' : 'Scheduled',
    }));

    const recentClips: CoachOverviewClip[] = recentClipsRaw.map((c) => ({
      id: c.id,
      title: c.title,
      timecode: this.formatDuration(c.endMs - c.startMs),
    }));

    const avgAccuracyFraction = accuracyRaw?.avg ? Number(accuracyRaw.avg) : 0;

    return {
      stats: {
        sessionsHosted,
        activeStudents: Number(activeStudentsRaw?.count ?? 0),
        avgTelemetryAccuracy: Math.round(Math.max(0, Math.min(1, avgAccuracyFraction)) * 100),
        replayClipsSaved,
      },
      sessionsOverTime: this.bucketWeekly(
        sessionsByDay.map((r) => ({ day: new Date(r.day), value: Number(r.value) })),
        since,
        weeks,
      ),
      studentFormTrends: this.bucketWeekly(
        accuracyByDay.map((r) => ({ day: new Date(r.day), value: Number(r.value) })),
        since,
        weeks,
      ),
      liveSessions,
      recentClips,
    };
  }

  async getStudentOverview(studentId: string): Promise<StudentOverviewResponse> {
    const [sessionsAttended, nextSession, clipsShared, recent] = await Promise.all([
      this.participantRepo.count({
        where: { userId: studentId, roleInSession: 'student', status: 'approved' } as any,
      }),
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoin('s.participants', 'p')
        .where('p.user_id = :studentId', { studentId })
        .andWhere("p.role_in_session = 'student'")
        .andWhere("p.status = 'approved'")
        .andWhere("s.status IN ('scheduled', 'live')")
        .andWhere('s.scheduled_at >= :now', { now: new Date() })
        .orderBy('s.scheduled_at', 'ASC')
        .getOne(),
      this.clipRepo
        .createQueryBuilder('c')
        .innerJoin('clip_shares', 'cs', 'cs.clip_id = c.id')
        .where('cs.shared_with_user_id = :studentId', { studentId })
        .getCount(),
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoin('s.participants', 'p')
        .where('p.user_id = :studentId', { studentId })
        .andWhere("p.role_in_session = 'student'")
        .andWhere("p.status = 'approved'")
        .orderBy('s.scheduled_at', 'DESC')
        .limit(5)
        .getMany(),
    ]);

    return {
      stats: {
        sessionsAttended,
        nextSession: nextSession
          ? {
              time: nextSession.scheduledAt.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
              title: `Session ${nextSession.id.substring(0, 8)}`,
              sessionId: nextSession.id,
            }
          : null,
        clipsShared,
      },
      recentSessions: recent.map((s) => ({
        id: s.id,
        title: `Session ${s.id.substring(0, 8)}`,
        date: s.scheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      })),
    };
  }

  /** A coach's "students" are derived from real session participation —
   * there is no separate roster entity. Distinct students the coach has
   * actually run a session with, most-recently-active first. */
  async getCoachStudents(coachId: string): Promise<CoachStudentSummary[]> {
    const rows = await this.participantRepo
      .createQueryBuilder('p')
      .innerJoin('p.session', 's')
      .innerJoin('p.user', 'u')
      .select('u.id', 'id')
      .addSelect('u.email', 'email')
      .addSelect('u.display_name', 'displayName')
      .addSelect('u.avatar_url', 'avatarUrl')
      .addSelect('u.status', 'status')
      .addSelect('COUNT(DISTINCT s.id)', 'sessionsCount')
      .addSelect('MAX(s.scheduled_at)', 'lastSessionAt')
      .where('s.coach_id = :coachId', { coachId })
      .andWhere("p.role_in_session = 'student'")
      .andWhere("p.status = 'approved'")
      .groupBy('u.id')
      .addGroupBy('u.email')
      .addGroupBy('u.display_name')
      .addGroupBy('u.avatar_url')
      .addGroupBy('u.status')
      .orderBy('"lastSessionAt"', 'DESC')
      .getRawMany<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        status: string;
        sessionsCount: string;
        lastSessionAt: Date | null;
      }>();

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      status: r.status,
      sessionsCount: Number(r.sessionsCount),
      lastSessionAt: r.lastSessionAt ? new Date(r.lastSessionAt).toISOString() : null,
    }));
  }

  private formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
