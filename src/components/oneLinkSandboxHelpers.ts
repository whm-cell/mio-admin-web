import { ApiClientError } from '../api';
import type { OneLinkPendingCandidate, UserAuthMe, UserAuthProfile } from '../types';

export const SANDBOX_RETURN_PATH = '/?nav=onelink-sandbox';

export type SandboxBannerTone = 'success' | 'info' | 'warning' | 'error';

export interface OneLinkCallbackBanner {
  result: string;
  tone: SandboxBannerTone;
  title: string;
  description: string;
}

export interface InlineErrorFeedback {
  tone: 'warning' | 'error';
  message: string;
  hint?: string;
}

export type AsyncState<T> = T & { loading: boolean; error: string | null };
export type SessionState = AsyncState<{
  session: UserAuthMe | null;
  profile: UserAuthProfile | null;
}>;
export type PendingState = AsyncState<{ pending: OneLinkPendingCandidate | null }>;

export const INIT_SESSION: SessionState = {
  session: null,
  profile: null,
  loading: true,
  error: null,
};

export const INIT_PENDING: PendingState = {
  pending: null,
  loading: true,
  error: null,
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CALLBACK_BANNERS: Record<string, readonly [SandboxBannerTone, string, string]> = {
  logged_in: ['success', '万联登录成功（logged_in）', '已自动签发 C 端会话并刷新账号资料。'],
  choose_account: [
    'info',
    '请选择账号处理方式（choose_account）',
    '在下方选择「创建新账号」或「绑定已有 Mio 账号」。',
  ],
  confirm_bind: [
    'info',
    '请确认绑定当前账号（confirm_bind）',
    '核对当前 C 端账号与万联账号 ID 后点击「确认绑定」。',
  ],
  unauthorized: ['error', '万联授权未通过（unauthorized）', '用户取消了授权或授权校验未通过。'],
  invalid_token: [
    'error',
    '万联回调凭证无效（invalid_token）',
    '回调 token 载荷无效或 clientId 校验未通过，请检查万联 SSO 配置。',
  ],
  invalid_state: ['error', '万联回调状态失效（invalid_state）', 'state 缺失或已过期，请重新发起。'],
  session_required: [
    'warning',
    '需要近期 C 端会话（session_required）',
    '绑定要求当前 C 端会话签发在 10 分钟内；请先退出并重新登录 C 端账号，再重新点击「绑定当前 C 端账号」。',
  ],
  account_disabled: [
    'error',
    '目标账号已停用（account_disabled）',
    '关联 Mio 账号已停用，无法继续。',
  ],
};

export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function formatTs(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN');
}

export function parseOneLinkCallbackResult(search: string): OneLinkCallbackBanner | null {
  const raw = new URLSearchParams(search).get('onelink_result')?.trim();
  if (!raw) return null;
  const hit = CALLBACK_BANNERS[raw];
  return hit
    ? { result: raw, tone: hit[0], title: hit[1], description: hit[2] }
    : {
        result: raw,
        tone: 'warning',
        title: `收到未识别的万联回调状态（${raw}）`,
        description: '请刷新下方 C 端会话与待确认授权状态并核查服务端日志。',
      };
}

export function buildCleanedSandboxUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('onelink_result');
  if (!url.searchParams.has('nav')) url.searchParams.set('nav', 'onelink-sandbox');
  return `${url.pathname}${url.search}${url.hash}`;
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function isSafeRedirectUrl(url: string): boolean {
  if (!url || hasControlChar(url)) {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//') && !trimmed.includes('\\');
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.protocol === 'https:') {
      return true;
    }
    if (parsed.protocol === 'http:') {
      return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
    }
    return false;
  } catch {
    return false;
  }
}

export function classifyPendingError(
  err: unknown,
  fallback: string,
): { feedback: InlineErrorFeedback; shouldRefresh: boolean } {
  const res = (
    message: string,
    tone: 'warning' | 'error' = 'error',
    hint?: string,
    shouldRefresh = false,
  ) => ({ feedback: { tone, message, ...(hint ? { hint } : {}) }, shouldRefresh });

  if (!(err instanceof ApiClientError)) return res(errMsg(err, fallback));
  if (err.code === 'ONELINK_ALREADY_BOUND' || err.code === 'PHONE_CONFLICT') {
    return res('该登录方式已绑定，暂不能完成本次操作');
  }
  if (err.code === 'EXISTING_PHONE_NOT_FOUND') {
    return res(
      err.message,
      'warning',
      '当前万联授权会话已保留，可换手机号重试，或点击左侧「创建新账号并登录」。',
    );
  }
  if (err.code === 'SESSION_REQUIRED') {
    return res(
      err.message,
      'warning',
      '原待绑记录绑定的是原会话 ID，请先在上方退出并重新登录 C 端账号（10 分钟内有效），再重新点击「绑定当前 C 端账号」发起绑定。',
    );
  }
  const stale =
    err.code === 'ONELINK_PENDING_NOT_FOUND' ||
    err.code === 'ONELINK_PENDING_INVALID' ||
    err.code === 'ONELINK_PENDING_ALREADY_COMPLETED';
  return res(err.message, 'error', undefined, stale);
}

export function resolveSessionRefresh(
  result: PromiseSettledResult<{ session: UserAuthMe; profile: UserAuthProfile }>,
  prev: SessionState,
): SessionState {
  if (result.status === 'fulfilled') {
    return { ...result.value, loading: false, error: null };
  }
  const err: unknown = result.reason;
  if (err instanceof ApiClientError && err.status === 401 && err.code === 'UNAUTHORIZED') {
    return { session: null, profile: null, loading: false, error: null };
  }
  return { ...prev, loading: false, error: errMsg(err, '读取 C 端会话失败') };
}

export function resolvePendingRefresh(
  result: PromiseSettledResult<OneLinkPendingCandidate>,
): PendingState {
  if (result.status === 'fulfilled') {
    return { pending: result.value, loading: false, error: null };
  }
  const err: unknown = result.reason;
  if (err instanceof ApiClientError && err.code === 'ONELINK_PENDING_NOT_FOUND') {
    return { pending: null, loading: false, error: null };
  }
  return { pending: null, loading: false, error: errMsg(err, '读取待确认万联授权失败') };
}
