import type {
  AdminAccount,
  AdminAuditLog,
  AdminCatalogSummary,
  AdminModelItem,
  AdminOneLinkSsoView,
  Category,
  CompleteOneLinkPayload,
  CompleteOneLinkResponse,
  ComputeExecutionDetailResponse,
  ComputeExecutionsListResponse,
  ComputeHistoryResponse,
  ComputeLimitsListResponse,
  ComputeSummaryResponse,
  ComputeWorkerExecutionState,
  ComputeWorkerView,
  ComputeWorkersListResponse,
  DiscoveryCandidateItem,
  DiscoveryResult,
  GlobalSettingsResponse,
  MonitoringData,
  MonitoringWindow,
  OneLinkAuthIntent,
  OneLinkPendingCandidate,
  ProbeStatus,
  RegisterOneLinkSsoResponse,
  RouteRevisionRecord,
  RouteTemplateItem,
  RouteTemplateUiHints,
  TemplatesListResponse,
  UpdateAdminOneLinkSsoInput,
  UpdateComputeWorkerLimitsInput,
  UpdateComputeWorkerLimitsResponse,
  UpdateGlobalSettingsInput,
  UserAuthMe,
  UserAuthProfile,
} from './types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const CODE_LABELS: Record<string, string> = {
  ADMIN_UNAUTHORIZED: '管理员登录已过期，请重新登录',
  ADMIN_INVALID_CREDENTIALS: '用户名或密码错误',
  ADMIN_PASSWORD_MISMATCH: '当前原始密码不正确',
  ADMIN_USERNAME_TAKEN: '该用户名已被占用',
  ADMIN_INPUT_INVALID: '输入参数格式不符合要求',
  MODEL_ALREADY_EXISTS: '该模型 ID 已存在于平台模型主表中',
  MODEL_NOT_FOUND: '未在平台模型主表中找到目标模型',
  TEMPLATE_KEY_TAKEN: '模板唯一标识 (templateKey) 已存在',
  TEMPLATE_NOT_FOUND: '未找到目标快捷模板',
  PROBE_KEY_REQUIRED: '请输入 OneLink API Key，或先保存一把常用探测 Key',
  PROBE_CREDENTIAL_UNAVAILABLE: '已保存的探测 Key 无法解密，请重新输入并保存',
  PROVIDER_KEY_INVALID: 'API Key 格式不合法（不能包含空白或掩码字符）',
  ROUTE_INVALID: '协议路由参数校验未通过，请检查驱动路径、尺寸/张数或异步配置是否合法',
  ROUTE_NOT_FOUND: '未找到目标模型路由记录',
  REVISION_NOT_FOUND: '未找到目标历史版本记录',
  REVISION_NOT_RESTORABLE: '删除类型的历史记录无路由快照，请选择上一条有效版本进行恢复',
  SETTINGS_CONFLICT: '全局配置已被其他操作更新，请刷新最新配置后再保存',
  ORIGIN_DENIED: '当前前端访问域名不在后端允许 Origin 列表内（检查 MIO_ADMIN_ALLOWED_ORIGINS）',
  COMPUTE_OPS_UNAVAILABLE: '后端未启用计算 Worker 观测或计算观测服务暂不可用',
  WORKER_NOT_FOUND: '未找到指定的计算 Worker 实例',
  WORKER_NOT_OBSERVED: '该 Worker 实例尚无遥测快照，收到心跳后可调整并发上限',
  WORKER_REVISION_CONFLICT: '其他操作员已更新该实例的配置修订，请刷新最新配置后重填',
  WORKER_HARD_LIMIT_EXCEEDED: '提交上限超过该实例的部署硬上限，请检查总槽、编码与探测上限',
  HARD_LIMIT_EXCEEDED: 'Worker 拒绝了配置：提交上限超出当前部署硬上限',
  STALE_REVISION: 'Worker 已处理更新的修订，当前调限命令已过时',
  INSTANCE_MISMATCH: 'Worker 实例身份与目标实例不一致',
  LIMITS_INVALID: 'Worker 拒绝了无效并发上限配置',
  QUERY_INVALID: '查询参数格式无效，请检查实例 ID、状态或任务 UUID',
  BODY_INVALID: '提交的调限参数格式不合法，请输入非负整数',
  ONELINK_SSO_NOT_CONFIGURED: '服务端尚未完成万联单点登录环境变量配置',
  ONELINK_REGISTER_IN_PROGRESS: '万联客户端注册正在进行中，请稍候完成后再试',
  ONELINK_SSO_UNAVAILABLE: '万联单点登录服务当前未启用或暂不可用',
  ONELINK_CLIENT_NAME_INVALID: '万联客户端名称不符合上游校验规则',
  ONELINK_CLIENT_TEMPLATE_MISSING: '万联上游缺少对应的客户端注册模板配置',
  ONELINK_REGISTER_UPSTREAM_FAILED: '调用万联客户端注册上游接口失败，请结合 traceId 排查',
  ONELINK_UNAVAILABLE: '万联登录当前未开启或暂不可用',
  ONELINK_ALREADY_BOUND: '该登录方式已绑定，暂不能完成本次操作',
  ONELINK_PENDING_NOT_FOUND: '未找到待确认的万联授权会话，或会话已过期，请重新发起',
  ONELINK_PENDING_INVALID: '待确认的万联授权凭证无效，请重新发起万联授权',
  ONELINK_PENDING_ALREADY_COMPLETED: '该次万联授权已完成处理，请刷新当前状态',
  EXISTING_PHONE_NOT_FOUND: '未找到该手机号对应的已有 Mio 账号，请更换手机号或选择创建新账号',
  SESSION_REQUIRED:
    '需要 10 分钟内的有效 C 端登录会话才能执行绑定，请重新登录后再重新发起「绑定当前 C 端账号」',
  INVALID_OTP: '验证码错误或已过期，请重新核对或再次获取',
  INVALID_INPUT: '请求参数格式不合法，请检查输入后重试',
  AUTH_UNAVAILABLE: '认证服务当前暂不可用，请稍后重试',
  ACCOUNT_DISABLED: '当前账号已被停用，无法继续登录或绑定',
  PHONE_CONFLICT: '该登录方式已绑定，暂不能完成本次操作',
  SMS_UNAVAILABLE: '短信验证码服务当前未配置或已关闭',
  SMS_RATE_LIMITED: '验证码发送过于频繁，请稍后再试',
  UNAUTHORIZED: '当前未登录或会话已失效，请先登录',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/v1/admin${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let message = `请求失败 (HTTP ${response.status})`;
    try {
      const data = (await response.json()) as { error?: { code?: string; message?: string } };
      if (data?.error?.code) {
        code = data.error.code;
        message = CODE_LABELS[code] ?? data.error.message ?? message;
      }
    } catch {
      // Ignore non-JSON error body
    }
    throw new ApiClientError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export const adminApi = {
  me: () => request<{ admin: AdminAccount }>('/auth/me'),

  login: (username: string, password: string) =>
    request<{ admin: AdminAccount }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  updateAccount: (payload: { username?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ admin: AdminAccount }>('/account', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getProbeStatus: () => request<ProbeStatus>('/onelink/probe'),

  discoverOneLink: (payload: { apiKey?: string; saveKey?: boolean }) =>
    request<DiscoveryResult>('/onelink/discover', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listDiscoveryCandidates: () =>
    request<{
      totalProbeModels: number;
      newCount: number;
      existingCount: number;
      ignoredCount: number;
      candidates: DiscoveryCandidateItem[];
    }>('/onelink/candidates'),

  clearProbeKey: () =>
    request<{ ok: boolean }>('/onelink/probe', {
      method: 'DELETE',
    }),

  importModels: (
    items: {
      rawModelId: string;
      displayLabel?: string | null;
      vendorLabel?: string | null;
      category?: Category | null;
      description?: string | null;
      supplierMetadata?: Record<string, unknown>;
      userVisible?: boolean;
      allowUndiscovered?: boolean;
      callNotes?: string | null;
    }[],
    overwriteMetadata = false,
  ) =>
    request<{ imported: number; updated: number; skipped: number }>('/models/import', {
      method: 'POST',
      body: JSON.stringify({ items, overwriteMetadata }),
    }),

  listModels: (
    params: {
      q?: string;
      category?: string;
      status?: string;
      visibility?: string;
    } = {},
  ) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v);
    }
    const qs = search.toString();
    return request<{ summary: AdminCatalogSummary; items: AdminModelItem[] }>(
      `/models${qs ? `?${qs}` : ''}`,
    );
  },

  createModel: (payload: {
    rawModelId: string;
    displayLabel?: string | null;
    vendorLabel?: string | null;
    category?: Category | null;
    description?: string | null;
    userVisible?: boolean;
    allowUndiscovered?: boolean;
    callNotes?: string | null;
  }) =>
    request<{ model: Record<string, unknown> }>('/models', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateModel: (payload: {
    rawModelId: string;
    displayLabel?: string | null;
    vendorLabel?: string | null;
    category?: Category | null;
    description?: string | null;
    userVisible?: boolean;
    allowUndiscovered?: boolean;
    callNotes?: string | null;
  }) =>
    request<{ model: Record<string, unknown> }>('/models', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteModel: (rawModelId: string, ignoreFutureImports = false, summary?: string) =>
    request<{ ok: boolean; rawModelId: string; deletedRoutesCount: number }>('/models', {
      method: 'DELETE',
      body: JSON.stringify({
        rawModelId,
        ignoreFutureImports,
        ...(summary ? { summary } : {}),
      }),
    }),

  publishRoute: (route: Record<string, unknown>, summary?: string) =>
    request<{
      total: number;
      inserted: number;
      updated: number;
      unchanged: number;
      revisions: { id: string; declarationVersion: number; action: string }[];
    }>('/routes', {
      method: 'POST',
      body: JSON.stringify({ route, ...(summary ? { summary } : {}) }),
    }),

  publishBatchRoutes: (routes: unknown[], summary?: string) =>
    request<{
      total: number;
      inserted: number;
      updated: number;
      unchanged: number;
    }>('/routes', {
      method: 'POST',
      body: JSON.stringify({ routes, ...(summary ? { summary } : {}) }),
    }),

  deleteRoute: (rawModelId: string, operation: 'chat' | 'image.generate', summary?: string) =>
    request<{ deleted: { id: string; declarationVersion: number; action: string } }>('/routes', {
      method: 'DELETE',
      body: JSON.stringify({ rawModelId, operation, ...(summary ? { summary } : {}) }),
    }),

  rollbackRoute: (revisionId: string, summary?: string) =>
    request<{
      revisionId: string;
      rawModelId: string;
      operation: string;
      declarationVersion: number;
      unchanged: boolean;
    }>('/routes/rollback', {
      method: 'POST',
      body: JSON.stringify({ revisionId, ...(summary ? { summary } : {}) }),
    }),

  listTemplates: () => request<TemplatesListResponse>('/templates'),

  createTemplate: (payload: {
    templateKey: string;
    label: string;
    description?: string;
    sortOrder?: number;
    routeTemplate: Record<string, unknown>;
    uiHints?: RouteTemplateUiHints;
  }) =>
    request<{ template: RouteTemplateItem }>('/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTemplate: (payload: {
    id: string;
    templateKey: string;
    label: string;
    description?: string;
    sortOrder?: number;
    routeTemplate: Record<string, unknown>;
    uiHints?: RouteTemplateUiHints;
  }) =>
    request<{ template: RouteTemplateItem }>('/templates', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>('/templates', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    }),

  listRevisions: (rawModelId?: string, limit = 50) => {
    const search = new URLSearchParams({ limit: String(limit) });
    if (rawModelId) search.set('rawModelId', rawModelId);
    return request<{ routeRevisions: RouteRevisionRecord[]; auditLogs: AdminAuditLog[] }>(
      `/revisions?${search.toString()}`,
    );
  },

  getMonitoring: (window: MonitoringWindow = '7d') =>
    request<MonitoringData>(`/monitoring?window=${window}`),

  getGlobalSettings: () => request<GlobalSettingsResponse>('/settings/global'),

  updateGlobalSettings: (payload: UpdateGlobalSettingsInput) =>
    request<GlobalSettingsResponse>('/settings/global', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getComputeSummary: (options?: { signal?: AbortSignal }) =>
    request<ComputeSummaryResponse>('/compute/summary', {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    }),

  listComputeWorkers: (
    params: { limit?: number; offset?: number } = {},
    options?: { signal?: AbortSignal },
  ) => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return request<ComputeWorkersListResponse>(`/compute/workers${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  },

  getComputeWorker: (instanceId: string, options?: { signal?: AbortSignal }) =>
    request<ComputeWorkerView>(`/compute/workers/${encodeURIComponent(instanceId)}`, {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    }),

  listComputeExecutions: (
    params: {
      instanceId?: string;
      jobId?: string;
      state?: ComputeWorkerExecutionState;
      limit?: number;
    } = {},
    options?: { signal?: AbortSignal },
  ) => {
    const search = new URLSearchParams();
    if (params.instanceId) search.set('instanceId', params.instanceId);
    if (params.jobId) search.set('jobId', params.jobId);
    if (params.state) search.set('state', params.state);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    const qs = search.toString();
    return request<ComputeExecutionsListResponse>(`/compute/executions${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  },

  getComputeExecution: (executionId: string, options?: { signal?: AbortSignal }) =>
    request<ComputeExecutionDetailResponse>(
      `/compute/executions/${encodeURIComponent(executionId)}`,
      {
        cache: 'no-store',
        ...(options?.signal ? { signal: options.signal } : {}),
      },
    ),

  getComputeHistory: (
    params: { instanceId?: string; since?: string; until?: string; limit?: number } = {},
    options?: { signal?: AbortSignal },
  ) => {
    const search = new URLSearchParams();
    if (params.instanceId) search.set('instanceId', params.instanceId);
    if (params.since) search.set('since', params.since);
    if (params.until) search.set('until', params.until);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    const qs = search.toString();
    return request<ComputeHistoryResponse>(`/compute/history${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  },

  listComputeLimits: (
    params: { instanceId?: string; limit?: number } = {},
    options?: { signal?: AbortSignal },
  ) => {
    const search = new URLSearchParams();
    if (params.instanceId) search.set('instanceId', params.instanceId);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    const qs = search.toString();
    return request<ComputeLimitsListResponse>(`/compute/limits${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  },

  updateComputeWorkerLimits: (instanceId: string, payload: UpdateComputeWorkerLimitsInput) =>
    request<UpdateComputeWorkerLimitsResponse>(
      `/compute/workers/${encodeURIComponent(instanceId)}/limits`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  getOneLinkSso: () => request<AdminOneLinkSsoView>('/onelink/sso'),

  updateOneLinkSso: (payload: UpdateAdminOneLinkSsoInput) =>
    request<AdminOneLinkSsoView>('/onelink/sso', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  registerOneLinkSso: () =>
    request<RegisterOneLinkSsoResponse>('/onelink/sso/register', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

async function userRequest<T>(absoluteApiPath: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(absoluteApiPath, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let message = `请求失败 (HTTP ${response.status})`;
    try {
      const data = (await response.json()) as {
        error?: { code?: string; message?: string };
        code?: string;
        message?: string;
      };
      const rawCode = data?.error?.code ?? data?.code;
      const rawMessage = data?.error?.message ?? data?.message;
      if (typeof rawCode === 'string' && rawCode.trim() !== '') {
        code = rawCode;
        message =
          CODE_LABELS[code] ??
          (typeof rawMessage === 'string' && rawMessage.trim() !== '' ? rawMessage : message);
      } else if (typeof rawMessage === 'string' && rawMessage.trim() !== '') {
        message = rawMessage;
      }
    } catch {
      // Ignore non-JSON error body
    }
    throw new ApiClientError(response.status, code, message);
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const userAuthApi = {
  me: () => userRequest<UserAuthMe>('/api/v1/me'),

  profile: () => userRequest<UserAuthProfile>('/api/v1/me/profile'),

  signOut: () =>
    userRequest<unknown>('/api/auth/sign-out', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  sendPhoneLoginOtp: (phoneNumber: string) =>
    userRequest<{ status: boolean }>('/api/auth/phone-number/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  verifyPhoneLogin: (phoneNumber: string, code: string) =>
    userRequest<{ status: boolean }>('/api/auth/phone-number/verify', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, code }),
    }),

  sendPhoneBindingOtp: (phoneNumber: string) =>
    userRequest<{ status: boolean }>('/api/auth/phone-binding/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  confirmPhoneBinding: (phoneNumber: string, code: string) =>
    userRequest<{ status: boolean }>('/api/auth/phone-binding/confirm', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, code }),
    }),

  startOneLink: (intent: OneLinkAuthIntent, returnPath: string) =>
    userRequest<{ url: string }>('/api/auth/onelink/start', {
      method: 'POST',
      body: JSON.stringify({ intent, returnPath }),
    }),

  getOneLinkPending: () => userRequest<OneLinkPendingCandidate>('/api/auth/onelink/pending'),

  cancelOneLinkPending: () =>
    userRequest<{ ok: boolean }>('/api/auth/onelink/cancel', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  sendOneLinkExistingOtp: (phoneNumber: string) =>
    userRequest<{ status: boolean }>('/api/auth/onelink/existing/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  completeOneLink: (payload: CompleteOneLinkPayload) =>
    userRequest<CompleteOneLinkResponse>('/api/auth/onelink/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
