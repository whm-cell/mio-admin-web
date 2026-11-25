export type Category = 'chat' | 'image' | 'video' | 'voice' | 'music';

export interface AdminAccount {
  id: string;
  username: string;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeStatus {
  hasSavedKey: boolean;
  maskedHint: string | null;
  keyVersion: number | null;
  lastProbedAt: string | null;
  lastProbeStatus: 'connected' | 'failed' | null;
  lastProbeCount: number | null;
  lastProbeError: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface DiscoveryCandidateItem {
  rawModelId: string;
  suggestedCategory: Category | null;
  suggestedVendor: string | null;
  supplierMetadata: Record<string, unknown>;
  importState: 'new' | 'existing' | 'ignored';
  lastSeenAt: string;
}

export interface DiscoveryResult {
  status: 'connected' | 'failed';
  checkedAt: string;
  discoveredCount: number;
  newCount: number;
  existingCount: number;
  ignoredCount: number;
  totalCatalogCount: number;
  savedKey: boolean;
  error: string | null;
  candidates: DiscoveryCandidateItem[];
}

export interface AdminModelPolicy {
  userVisible: boolean;
  allowUndiscovered: boolean;
  displayLabel: string | null;
  callNotes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface RouteMeta {
  enabled: boolean;
  declarationVersion: number;
  driver: string;
  vendor: string;
  updatedAt: string;
}

export interface AdminModelItem {
  rawModelId: string;
  displayLabel: string | null;
  vendorLabel: string | null;
  category: Category | null;
  description: string | null;
  originSource: 'onelink-import' | 'admin-manual' | 'route-import';
  inBenchmarkCatalog: boolean;
  inLatestProbe: boolean;
  benchmarkMetadata: Record<string, unknown> | null;
  benchmarkLastSeenAt: string | null;
  userDiscoveredCount: number;
  userVerifiedChatCount: number;
  userVerifiedImageCount: number;
  policy: AdminModelPolicy;
  chatRoute: Record<string, unknown> | null;
  imageRoute: Record<string, unknown> | null;
  chatRouteMeta: RouteMeta | null;
  imageRouteMeta: RouteMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCatalogSummary {
  totalModels: number;
  benchmarkModels: number;
  configuredEnabled: number;
  configuredDisabled: number;
  pendingRoutes: number;
  hiddenFromUsers: number;
  curatedUndiscovered: number;
}

export interface RouteTemplateUiHints {
  recommendedSizes?: string[];
  recommendedAspectRatios?: string[];
  recommendedOutputFormats?: string[];
  recommendedQualities?: string[];
  recommendedBackgrounds?: string[];
}

export interface RouteTemplateItem {
  id: string;
  templateKey: string;
  label: string;
  description: string;
  operation: 'chat' | 'image.generate';
  vendor: string;
  driver: string;
  routeTemplate: Record<string, unknown>;
  uiHints: RouteTemplateUiHints;
  sortOrder: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatesListResponse {
  drivers: {
    chat: string[];
    image: string[];
  };
  categories: Category[];
  items: RouteTemplateItem[];
}

export type MonitoringWindow = '24h' | '7d' | '30d' | 'all';

export interface RabbitmqNodeHealth {
  name: string;
  running: boolean;
  memUsedBytes: number;
  memLimitBytes: number;
  memAlarm: boolean;
  diskFreeBytes: number;
  diskFreeLimitBytes: number;
  diskFreeAlarm: boolean;
  fdUsed: number;
  fdTotal: number;
  socketsUsed: number;
  socketsTotal: number;
  procUsed: number;
  procTotal: number;
  uptimeMs: number;
}

export interface RabbitmqQueueMetrics {
  name: string;
  type: string;
  state: string;
  isDlq: boolean;
  consumers: number;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  memoryBytes: number;
  publishPerSec: number;
  deliverPerSec: number;
  ackPerSec: number;
}

export interface RabbitmqMonitoringData {
  configured: boolean;
  status: 'up' | 'down' | 'unconfigured';
  checkedAt: string;
  latencyMs: number | null;
  vhost: string | null;
  errorCode: string | null;
  rabbitmqVersion: string | null;
  erlangVersion: string | null;
  clusterName: string | null;
  hasAlarms: boolean;
  dlqMessages: number;
  objectTotals: {
    connections: number;
    channels: number;
    exchanges: number;
    queues: number;
    consumers: number;
  } | null;
  queueTotals: {
    messages: number;
    messagesReady: number;
    messagesUnacknowledged: number;
  } | null;
  rates: {
    publishPerSec: number;
    deliverGetPerSec: number;
    ackPerSec: number;
  } | null;
  nodes: RabbitmqNodeHealth[];
  queues: RabbitmqQueueMetrics[];
}

export interface RedisMonitoringData {
  configured: boolean;
  status: 'up' | 'down' | 'unconfigured';
  checkedAt: string;
  latencyMs: number | null;
  errorCode: string | null;
  redisVersion: string | null;
  uptimeSeconds: number | null;
  clockDriftMs: number | null;
  clockHealthy: boolean | null;
  dbsize: number | null;
  memory: {
    usedBytes: number;
    usedHuman: string;
    peakBytes: number;
    peakHuman: string;
    maxBytes: number;
    maxHuman: string;
    policy: string;
    usageRatio: number | null;
    fragmentationRatio: number | null;
    oomRisk: boolean;
  } | null;
  clients: {
    connected: number;
    blocked: number;
    rejectedConnections: number;
  } | null;
  stats: {
    instantaneousOpsPerSec: number;
    totalCommandsProcessed: number;
    evictedKeys: number;
    keyspaceHits: number;
    keyspaceMisses: number;
  } | null;
  persistence: {
    aofEnabled: boolean;
    aofLastWriteStatus: string;
    rdbLastBgsaveStatus: string;
  } | null;
}

export interface MonitoringData {
  window: MonitoringWindow;
  generatedAt: string;
  providers: {
    totalAccounts: number;
    enabledAccounts: number;
    validAccounts: number;
    rejectedAccounts: number;
    uncheckedAccounts: number;
  };
  images: {
    enabled: boolean;
    totals: {
      total: number;
      completed: number;
      inFlight: number;
      rejected: number;
      upstreamFailed: number;
      storageFailed: number;
    };
    byModel: {
      modelId: string;
      driver: string;
      total: number;
      completed: number;
      inFlight: number;
      rejected: number;
      upstreamFailed: number;
      storageFailed: number;
    }[];
    recentJobs: {
      id: string;
      modelId: string;
      driver: string;
      state: string;
      phase: string | null;
      storageFailed: boolean;
      queryAttempt: number;
      errorCode: string | null;
      outputCount: number;
      createdAt: string;
    }[];
  };
  conversations: {
    enabled: boolean;
    totals: {
      total: number;
      completed: number;
      inFlight: number;
      failed: number;
      cancelled: number;
      unknown: number;
    };
    byModel: {
      modelId: string;
      protocol: string;
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
    }[];
    recentRequests: {
      conversationId: string;
      requestId: string;
      modelId: string;
      status: string;
      errorCode: string | null;
      createdAt: string;
      updatedAt: string;
    }[];
  };
  compute: {
    enabled: boolean;
    jobs: {
      total: number;
      accepted: number;
      queued: number;
      running: number;
      succeeded: number;
      failed: number;
    };
    outbox: {
      pending: number;
      leased: number;
      oldestUnsentAgeSeconds: number | null;
    };
    inboxProcessed: number;
  };
  rabbitmq: RabbitmqMonitoringData;
  redis: RedisMonitoringData;
}

export interface RouteRevisionRecord {
  id: string;
  provider_type: 'onelink';
  raw_model_id: string;
  operation: 'chat' | 'image.generate';
  declaration_version: number;
  action: 'create' | 'update' | 'enable' | 'disable' | 'delete' | 'rollback' | 'cli-import';
  actor_type: 'admin' | 'cli';
  actor_id: string | null;
  actor_name: string;
  summary: string | null;
  before_route: Record<string, unknown> | null;
  after_route: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  summary: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export type AuthSmsMode = 'live' | 'bypass' | 'disabled';

export interface GlobalAuthSettings {
  emailPasswordEnabled: boolean;
  smsMode: AuthSmsMode;
  smsBypassCode: string | null;
}

export interface GlobalSettingsData {
  auth: GlobalAuthSettings;
  revision: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface GlobalSettingsRuntimeInfo {
  envEmailPasswordDefault: boolean;
  smsProviderConfigured: boolean;
}

export interface GlobalSettingsResponse {
  settings: GlobalSettingsData;
  runtime: GlobalSettingsRuntimeInfo;
}

export interface UpdateGlobalSettingsInput {
  expectedRevision: number;
  auth: GlobalAuthSettings;
}

export type ComputeWorkerResourceClass = 'encode' | 'probe';

export type ComputeWorkerMetricKey = 'total' | 'encode' | 'probe';

export interface ComputeWorkerLimits {
  total: number;
  encode: number;
  probe: number;
}

export type ComputeWorkerStatus = 'online' | 'stale' | 'offline' | 'unseen';

export type ComputeWorkerExecutionProtocol = 'transcode.v1' | 'audio.inspect.v1' | 'media';

export type ComputeWorkerExecutionState =
  'queued' | 'active' | 'released' | 'cancelled' | 'unknown';

export type ComputeWorkerExecutionPhase = 'downloading' | 'processing' | 'uploading' | 'finalizing';

export type ComputeWorkerLimitChangeStatus = 'pending' | 'applied' | 'rejected';

export type ComputeWorkerLimitRejectionReason =
  'HARD_LIMIT_EXCEEDED' | 'INSTANCE_MISMATCH' | 'LIMITS_INVALID' | 'STALE_REVISION';

export interface ComputeWorkerExecutionIdentity {
  executionId: string;
  protocol: ComputeWorkerExecutionProtocol;
  jobId: string;
  attemptId: string | null;
  inspectionId: string | null;
  resource: ComputeWorkerResourceClass;
  slots: 1;
}

export interface ComputeWorkerActiveExecution extends ComputeWorkerExecutionIdentity {
  acquiredAt: number;
}

export interface ComputeWorkerTelemetryGapPosition {
  bootSequence: number;
  sequence: number;
  at: number;
}

export interface ComputeWorkerTelemetryGap {
  first: ComputeWorkerTelemetryGapPosition;
  last: ComputeWorkerTelemetryGapPosition;
  count: number;
}

export interface ComputeWorkerSnapshot {
  limits: {
    hard: ComputeWorkerLimits;
    applied: ComputeWorkerLimits;
    revision: number;
  };
  usage: ComputeWorkerLimits;
  waiting: ComputeWorkerLimits;
  holds: {
    encode: string[];
    probe: string[];
  };
  active: ComputeWorkerActiveExecution[];
}

export interface ComputeWorkerDesiredLimits {
  limits: ComputeWorkerLimits;
  revision: number;
  commandId: string | null;
  status: ComputeWorkerLimitChangeStatus | null;
  reason: ComputeWorkerLimitRejectionReason | null;
  requestedAt: string | null;
  confirmedAt: string | null;
}

export interface ComputeWorkerView {
  instanceId: string;
  status: ComputeWorkerStatus;
  bootId: string | null;
  observedAt: string | null;
  receivedAt: string | null;
  ageMs: number | null;
  clockUncertain: boolean;
  gap: ComputeWorkerTelemetryGap | null;
  draining: boolean;
  snapshot: ComputeWorkerSnapshot | null;
  desired: ComputeWorkerDesiredLimits | null;
}

export interface ComputeSummaryResponse {
  now: string;
  instances: {
    online: number;
    stale: number;
    offline: number;
    unseen: number;
  };
  aggregate: {
    usage: ComputeWorkerLimits;
    applied: ComputeWorkerLimits;
    hard: ComputeWorkerLimits;
    waiting: ComputeWorkerLimits;
    heldResources: number;
  };
  outbox: {
    transcode: number;
    media: number;
    total: number;
  };
  broker: {
    ready: number | null;
    unacknowledged: number | null;
  };
  peaks: {
    instanceId: string;
    peak: number;
  }[];
}

export interface ComputeWorkersListResponse {
  workers: ComputeWorkerView[];
  total: number;
  offset: number;
}

export interface ComputeWorkerExecutionView {
  executionId: string;
  instanceId: string;
  bootId: string;
  protocol: string;
  jobId: string;
  attemptId: string | null;
  inspectionId: string | null;
  resource: ComputeWorkerResourceClass;
  slots: number;
  state: ComputeWorkerExecutionState;
  uncertain: boolean;
  queuedAt: string | null;
  acquiredAt: string | null;
  endedAt: string | null;
  lastAt: string;
  businessState: string | null;
  businessStage: string | null;
}

export interface ComputeExecutionsListResponse {
  executions: ComputeWorkerExecutionView[];
}

export type ComputeWorkerTelemetryEvent =
  | {
      kind: 'phase';
      phase: ComputeWorkerExecutionPhase;
      at: number;
      execution: ComputeWorkerExecutionIdentity;
    }
  | {
      kind: 'execution';
      state: 'queued' | 'acquired' | 'released' | 'cancelled';
      at: number;
      execution: ComputeWorkerExecutionIdentity;
    }
  | {
      kind: 'hold';
      state: 'blocked' | 'unblocked';
      at: number;
      resource: ComputeWorkerResourceClass;
      identity: string;
    }
  | {
      kind: 'limits';
      state: 'applied';
      at: number;
      limits: ComputeWorkerLimits;
    };

export interface ComputeExecutionTimelineItem {
  sequence: number;
  detail: ComputeWorkerTelemetryEvent;
  at: string;
  receivedAt: string;
}

export interface ComputeExecutionDetailResponse extends ComputeWorkerExecutionView {
  timeline: ComputeExecutionTimelineItem[];
}

export interface ComputeHistoryPoint {
  at: string;
  bootId?: string;
  usage: ComputeWorkerLimits;
  waiting: ComputeWorkerLimits;
  applied: ComputeWorkerLimits;
  hard: ComputeWorkerLimits;
  workers: number;
  clockUncertain: boolean;
  gap: boolean;
}

export interface ComputeHistoryResponse {
  since: string;
  until: string;
  points: ComputeHistoryPoint[];
}

export interface ComputeLimitChangeRecord {
  commandId: string;
  instanceId: string;
  revision: number;
  requestedBy: string;
  requestedAt: string;
  previousLimits: ComputeWorkerLimits;
  requestedLimits: ComputeWorkerLimits;
  status: ComputeWorkerLimitChangeStatus;
  reason: ComputeWorkerLimitRejectionReason | null;
  appliedLimits: ComputeWorkerLimits | null;
  confirmedAt: string | null;
  resultObservedAt: string | null;
}

export interface ComputeLimitsListResponse {
  changes: ComputeLimitChangeRecord[];
}

export interface UpdateComputeWorkerLimitsInput {
  expectedRevision: number;
  total: number;
  encode: number;
  probe: number;
}

export interface UpdateComputeWorkerLimitsResponse {
  commandId: string;
  revision: number;
  requestedAt: string;
  limits: ComputeWorkerLimits;
  status: 'pending';
}

export type OneLinkSsoRegistrationStatus = 'unregistered' | 'registered' | 'trusted_existing';

export type OneLinkSsoRegistrationSource = 'register_200' | 'register_362_trusted';

export interface AdminOneLinkSsoConfig {
  environment: string;
  enabled: boolean;
  clientName: string;
  clientId: string | null;
  expectedClientId: string | null;
  registrationStatus: OneLinkSsoRegistrationStatus;
  registrationSource: OneLinkSsoRegistrationSource | null;
  lastRegisterCode: number | null;
  lastRegisterTraceId: string | null;
  lastRegisterMessage: string | null;
  lastRegisteredAt: string | null;
  revision: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AdminOneLinkSsoRuntime {
  configured: boolean;
  hasEncryptionKey: boolean;
  authorizeOrigin: string | null;
  registerOrigin: string | null;
  callbackUrl: string | null;
  tokenVerificationMode: 'payload_sub_unverified';
}

export interface AdminOneLinkSsoView {
  config: AdminOneLinkSsoConfig;
  runtime: AdminOneLinkSsoRuntime;
}

export interface UpdateAdminOneLinkSsoInput {
  expectedRevision: number;
  enabled: boolean;
  expectedClientId: string | null;
}

export type OneLinkSsoRegisterOutcome =
  'registered' | 'already_exists_trusted' | 'rejected' | 'failed';

export interface RegisterOneLinkSsoResponse extends AdminOneLinkSsoView {
  outcome: OneLinkSsoRegisterOutcome;
  upstreamCode: number | null;
  errorCode: string | null;
  traceId: string | null;
}

export interface UserAuthMe {
  userId: string;
  sessionId: string;
}

export interface UserAuthProfile {
  userId: string;
  displayId: string | null;
  name: string;
  avatarAssetId: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  wechatBound: boolean;
  onelinkBound: boolean;
}

export type OneLinkAuthIntent = 'login' | 'bind';

export interface OneLinkPendingCandidate {
  status: 'candidate_ready';
  intent: OneLinkAuthIntent;
  candidateToken: string;
  onelinkSub: string;
  onelinkSubMasked: string;
  clientId: string | null;
  expiresAt: string;
}

export type CompleteOneLinkPayload =
  | { action: 'create'; candidateToken: string }
  | { action: 'link_existing'; candidateToken: string; phoneNumber: string; code: string }
  | { action: 'bind_current'; candidateToken: string };

export interface CompleteOneLinkResponse {
  status: boolean;
  action: 'create' | 'link_existing' | 'bind_current';
  userId: string;
  alreadyBound?: boolean;
}
