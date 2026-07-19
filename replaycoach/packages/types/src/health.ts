export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface DependencyStatus {
  status: 'ok' | 'error';
  detail?: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    poseService: DependencyStatus;
    liveKit: DependencyStatus;
  };
}
