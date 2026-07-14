export type DashboardRange = '7d' | '30d' | '90d';

export interface CoachOverviewSession {
  id: string;
  title: string;
  datetime: string;
  participants: number;
  status: 'Live' | 'Scheduled' | 'Ended';
}

export interface CoachOverviewClip {
  id: string;
  title: string;
  timecode: string;
}

export interface CoachOverviewResponse {
  stats: {
    sessionsHosted: number;
    activeStudents: number;
    avgTelemetryAccuracy: number;
    replayClipsSaved: number;
  };
  sessionsOverTime: number[];
  studentFormTrends: number[];
  liveSessions: CoachOverviewSession[];
  recentClips: CoachOverviewClip[];
}

export interface CoachStudentSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  sessionsCount: number;
  lastSessionAt: string | null;
}

export interface StudentOverviewResponse {
  stats: {
    sessionsAttended: number;
    nextSession: { time: string; title: string; sessionId: string } | null;
    clipsShared: number;
  };
  recentSessions: { id: string; title: string; date: string }[];
}
