import type {
  AdminAccount,
  AdminAuditLog,
  AdminCatalogSummary,
  AdminModelItem,
  Category,
  DiscoveryCandidateItem,
  DiscoveryResult,
  GlobalSettingsResponse,
  MonitoringData,
  MonitoringWindow,
  ProbeStatus,
  RouteRevisionRecord,
  RouteTemplateItem,
  RouteTemplateUiHints,
  TemplatesListResponse,
  UpdateGlobalSettingsInput,
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

const CODE_LABELS: Record<string, string> = {
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
};
