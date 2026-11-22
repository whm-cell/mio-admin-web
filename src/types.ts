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
