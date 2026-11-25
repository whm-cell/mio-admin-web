import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, CODE_LABELS, adminApi } from '../api';
import type {
  AdminOneLinkSsoConfig,
  AdminOneLinkSsoRuntime,
  AdminOneLinkSsoView,
  OneLinkSsoRegistrationSource,
  OneLinkSsoRegistrationStatus,
  RegisterOneLinkSsoResponse,
} from '../types';

export interface RegisterFeedback {
  tone: 'success' | 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  traceId: string | null;
}

const REGISTRATION_SOURCE_LABELS: Record<OneLinkSsoRegistrationSource, string> = {
  register_200: '主动注册返回 200',
  register_362_trusted: '同名既有配置确认（362）',
};

export function getRegistrationStatusBadge(status: OneLinkSsoRegistrationStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'registered':
      return { label: '已注册', className: 'bg-emerald-100 text-emerald-800' };
    case 'trusted_existing':
      return { label: '已确认可信(362)', className: 'bg-indigo-100 text-indigo-800' };
    default:
      return { label: '未注册', className: 'bg-slate-100 text-slate-700' };
  }
}

export function validateExpectedClientId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.toLowerCase() === 'routerclientid') {
    return '禁止填写 routerClientId（上游网关保留标识），请留空或填写有效应用 clientId';
  }
  if (/\s/.test(trimmed)) {
    return '期望 clientId 不能包含空白字符';
  }
  if (trimmed.length > 128) {
    return '期望 clientId 长度不能超过 128 个字符';
  }
  return null;
}

export function shouldPreserveDraftAfterRegister(
  previousRevision: number,
  res: RegisterOneLinkSsoResponse,
): boolean {
  return (
    (res.outcome === 'rejected' || res.outcome === 'failed') &&
    res.config.revision === previousRevision
  );
}

export function formatRegisterOutcomeFeedback(res: RegisterOneLinkSsoResponse): RegisterFeedback {
  const codeLabel = res.errorCode ? (CODE_LABELS[res.errorCode] ?? res.errorCode) : null;

  switch (res.outcome) {
    case 'registered':
      return {
        tone: 'success',
        title: `注册成功（上游 ${res.upstreamCode ?? 200}）`,
        detail: `已保存万联 clientId：${res.config.clientId ?? '—'}。`,
        traceId: res.traceId ?? res.config.lastRegisterTraceId,
      };
    case 'already_exists_trusted':
      return {
        tone: 'info',
        title: `已确认可信既有客户端（上游 ${res.upstreamCode ?? 362}）`,
        detail:
          '万联上游已存在同名客户端，已标记为可信既有配置（trusted_existing）；可通过下方 expectedClientId 校验回调标识。',
        traceId: res.traceId ?? res.config.lastRegisterTraceId,
      };
    case 'rejected': {
      const codePart = res.upstreamCode !== null ? `上游 ${res.upstreamCode}` : '上游拒绝';
      return {
        tone: 'warning',
        title: `万联上游拒绝注册（${codePart}）`,
        detail: codeLabel ?? '请核查 clientName 及上游客户端模板配置后重试。',
        traceId: res.traceId,
      };
    }
    case 'failed': {
      const codePart = res.upstreamCode !== null ? `上游 ${res.upstreamCode}` : '请求异常';
      return {
        tone: 'error',
        title: `万联客户端注册失败（${codePart}）`,
        detail: codeLabel ?? '调用万联注册接口失败，请结合 traceId 与后端日志排查。',
        traceId: res.traceId,
      };
    }
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN');
}

function RuntimeReadinessSection({ runtime }: { runtime: AdminOneLinkSsoRuntime }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">.env 运行时配置状态</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
              runtime.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {runtime.configured ? 'configured: 已就绪' : 'configured: 未就绪'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
              runtime.hasEncryptionKey
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            加密密钥：{runtime.hasEncryptionKey ? '已配置' : '未配置'}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-[11px] text-slate-500">authorizeOrigin</dt>
          <dd className="font-mono text-slate-800 break-all mt-0.5">
            {runtime.authorizeOrigin ?? '未配置'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">registerOrigin</dt>
          <dd className="font-mono text-slate-800 break-all mt-0.5">
            {runtime.registerOrigin ?? '未配置'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] text-slate-500">callbackUrl</dt>
          <dd className="font-mono text-slate-800 break-all mt-0.5">
            {runtime.callbackUrl ?? '未配置'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RegistrationStatusSection({
  config,
  runtimeConfigured,
  disabled,
  registering,
  feedback,
  onRegister,
}: {
  config: AdminOneLinkSsoConfig;
  runtimeConfigured: boolean;
  disabled: boolean;
  registering: boolean;
  feedback: RegisterFeedback | null;
  onRegister: () => void;
}) {
  const statusBadge = getRegistrationStatusBadge(config.registrationStatus);
  const feedbackStyle =
    feedback?.tone === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : feedback?.tone === 'info'
        ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
        : feedback?.tone === 'warning'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-rose-50 border-rose-200 text-rose-800';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-900">客户端注册状态</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
          {config.registrationSource && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
              {REGISTRATION_SOURCE_LABELS[config.registrationSource]}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={disabled || registering || !runtimeConfigured}
          onClick={onRegister}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-40 text-xs font-medium transition cursor-pointer"
        >
          <Send className={`h-3.5 w-3.5 ${registering ? 'animate-pulse' : ''}`} />
          {registering ? '正在注册万联客户端…' : '注册万联客户端'}
        </button>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-[11px] text-slate-500">clientName</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{config.clientName || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">已保存 clientId</dt>
          <dd className="font-mono text-slate-800 mt-0.5">{config.clientId ?? '尚未获取'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">最近注册返回码 / 时间</dt>
          <dd className="text-slate-700 mt-0.5">
            <span className="font-mono">{config.lastRegisterCode ?? '—'}</span>
            <span className="text-slate-400 mx-1.5">·</span>
            <span>{formatDateTime(config.lastRegisteredAt)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">最近 traceId</dt>
          <dd className="font-mono text-slate-800 break-all mt-0.5">
            {config.lastRegisterTraceId ?? '—'}
          </dd>
        </div>
        {config.lastRegisterMessage && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] text-slate-500">最近注册说明</dt>
            <dd className="text-slate-700 mt-0.5 break-all">{config.lastRegisterMessage}</dd>
          </div>
        )}
      </dl>

      {feedback && (
        <div className={`rounded-lg border px-3.5 py-2.5 text-xs space-y-1 ${feedbackStyle}`}>
          <div className="font-semibold">{feedback.title}</div>
          <p className="leading-relaxed">{feedback.detail}</p>
          {feedback.traceId && (
            <div className="text-[11px] font-mono opacity-90">traceId: {feedback.traceId}</div>
          )}
        </div>
      )}
    </div>
  );
}

interface OneLinkControlsSectionProps {
  runtimeConfigured: boolean;
  enabled: boolean;
  expectedClientIdInput: string;
  expectedClientIdError: string | null;
  controlsBusy: boolean;
  loading: boolean;
  saving: boolean;
  isDirty: boolean;
  canSave: boolean;
  conflictError: string | null;
  saveError: string | null;
  notice: string | null;
  onToggleEnabled: () => void;
  onExpectedClientIdChange: (next: string) => void;
  onReload: () => void;
  onResetDraft: () => void;
  onSave: () => void;
}

function OneLinkControlsSection({
  runtimeConfigured,
  enabled,
  expectedClientIdInput,
  expectedClientIdError,
  controlsBusy,
  loading,
  saving,
  isDirty,
  canSave,
  conflictError,
  saveError,
  notice,
  onToggleEnabled,
  onExpectedClientIdChange,
  onReload,
  onResetDraft,
  onSave,
}: OneLinkControlsSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">
                启用万联单点登录（热生效开关）
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {enabled ? '已开启' : '已关闭'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              保存后无需重启立即生效；关闭后 C 端万联登录与绑定入口将返回不可用错误。
            </p>
            {!runtimeConfigured && (
              <p className="text-[11px] text-amber-700">
                提示：当前服务端未完成万联 SSO 环境变量配置（configured =
                false），暂无法开启登录开关或执行客户端注册。
              </p>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="万联单点登录开关"
            disabled={!runtimeConfigured || controlsBusy}
            onClick={onToggleEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-40 cursor-pointer ${
              enabled ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="space-y-1.5 max-w-lg">
          <label
            htmlFor="onelink-sso-expected-client-id"
            className="block text-xs font-medium text-slate-700"
          >
            期望回调 clientId（可选）
          </label>
          <input
            id="onelink-sso-expected-client-id"
            type="text"
            autoComplete="off"
            disabled={controlsBusy}
            value={expectedClientIdInput}
            onChange={(e) => onExpectedClientIdChange(e.target.value)}
            placeholder="留空默认兼容 miioo / miiooClientId"
            className={`w-full px-3.5 py-2 text-xs font-mono rounded-lg border bg-white outline-none ${
              expectedClientIdError
                ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                : 'border-slate-300 focus:border-indigo-500'
            }`}
          />
          {expectedClientIdError ? (
            <p className="text-xs text-rose-600">{expectedClientIdError}</p>
          ) : (
            <p className="text-[11px] text-slate-500">
              留空保存为 null（默认兼容 miioo / miiooClientId）；禁止填写{' '}
              <code className="font-mono text-slate-700">routerClientId</code>。
            </p>
          )}
        </div>
      </div>

      {conflictError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-rose-800">
            <ShieldAlert className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">检测到并发配置冲突（409）</div>
              <p className="mt-0.5">{conflictError}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onReload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新加载最新配置
          </button>
        </div>
      )}

      {saveError && (
        <div className="rounded-lg px-3.5 py-2.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {notice && (
        <div className="rounded-lg px-3.5 py-2.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
        <div className="text-xs">
          {isDirty ? (
            <span className="font-medium text-amber-700">当前万联 SSO 配置存在未保存修改</span>
          ) : (
            <span className="text-slate-500">当前万联 SSO 配置与服务端已生效版本一致</span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {isDirty && (
            <button
              type="button"
              disabled={controlsBusy}
              onClick={onResetDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              还原未保存修改
            </button>
          )}
          <button
            type="button"
            disabled={!canSave}
            onClick={onSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中…' : '保存万联 SSO 配置'}
          </button>
        </div>
      </div>
    </>
  );
}

function OneLinkCardHeader({
  loaded,
  loading,
  controlsBusy,
  onRefresh,
}: {
  loaded: AdminOneLinkSsoView | null;
  loading: boolean;
  controlsBusy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">万联单点登录（OneLink SSO）</h3>
            {loaded && (
              <>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-slate-100 text-slate-700">
                  env: {loaded.config.environment}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-indigo-100 text-indigo-800">
                  revision #{loaded.config.revision}
                </span>
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {loaded
              ? `最近更新人：${loaded.config.updatedBy ?? '尚未修改'} · 最近更新时间：${formatDateTime(loaded.config.updatedAt)}`
              : '仅只读加载当前环境状态，不会自动触发上游注册'}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={controlsBusy}
        onClick={onRefresh}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? '刷新中…' : '刷新状态'}
      </button>
    </div>
  );
}

export function OneLinkSsoSettingsCard() {
  const [loaded, setLoaded] = useState<AdminOneLinkSsoView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [expectedClientIdInput, setExpectedClientIdInput] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerFeedback, setRegisterFeedback] = useState<RegisterFeedback | null>(null);
  const requestSeqRef = useRef(0);

  const syncFromView = useCallback((view: AdminOneLinkSsoView) => {
    setLoaded(view);
    setEnabled(view.config.enabled);
    setExpectedClientIdInput(view.config.expectedClientId ?? '');
  }, []);

  const loadConfig = useCallback(
    async (clearFeedback = true) => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      setLoadError(null);
      if (clearFeedback) {
        setSaveError(null);
        setConflictError(null);
        setNotice(null);
      }
      try {
        const view = await adminApi.getOneLinkSso();
        if (seq !== requestSeqRef.current) return;
        syncFromView(view);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setLoadError(err instanceof Error ? err.message : '加载万联单点登录配置失败');
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [syncFromView],
  );

  useEffect(() => {
    void loadConfig(false);
  }, [loadConfig]);

  const trimmedExpected = expectedClientIdInput.trim();
  const normalizedExpected: string | null = trimmedExpected === '' ? null : trimmedExpected;
  const expectedClientIdError = validateExpectedClientId(expectedClientIdInput);

  const isDirty =
    loaded !== null &&
    (enabled !== loaded.config.enabled || normalizedExpected !== loaded.config.expectedClientId);

  const controlsBusy = loading || saving || registering;
  const canSave = loaded !== null && isDirty && expectedClientIdError === null && !controlsBusy;

  const handleResetDraft = () => {
    if (!loaded) return;
    setEnabled(loaded.config.enabled);
    setExpectedClientIdInput(loaded.config.expectedClientId ?? '');
    setSaveError(null);
    setConflictError(null);
    setNotice(null);
  };

  const handleSave = async () => {
    if (!loaded || !canSave) {
      return;
    }
    const seq = ++requestSeqRef.current;
    setSaving(true);
    setSaveError(null);
    setConflictError(null);
    setNotice(null);
    try {
      const updated = await adminApi.updateOneLinkSso({
        expectedRevision: loaded.config.revision,
        enabled,
        expectedClientId: normalizedExpected,
      });
      if (seq !== requestSeqRef.current) return;
      syncFromView(updated);
      setNotice(`万联单点登录配置已更新至 v${updated.config.revision} 并立即热生效。`);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (err instanceof ApiClientError && err.code === 'SETTINGS_CONFLICT') {
        setConflictError(err.message);
      } else {
        setSaveError(err instanceof Error ? err.message : '保存万联单点登录配置失败');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setSaving(false);
      }
    }
  };

  const handleRegister = async () => {
    if (!loaded || !loaded.runtime.configured || registering || saving || loading) {
      return;
    }
    const seq = ++requestSeqRef.current;
    const previousRevision = loaded.config.revision;
    setRegistering(true);
    setRegisterFeedback(null);
    setSaveError(null);
    setConflictError(null);
    try {
      const res = await adminApi.registerOneLinkSso();
      if (seq !== requestSeqRef.current) return;
      if (shouldPreserveDraftAfterRegister(previousRevision, res)) {
        setLoaded(res);
      } else {
        syncFromView(res);
      }
      setRegisterFeedback(formatRegisterOutcomeFeedback(res));
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setRegisterFeedback({
        tone: 'error',
        title: '发起万联客户端注册失败',
        detail: err instanceof Error ? err.message : '调用万联客户端注册接口异常',
        traceId: null,
      });
    } finally {
      if (seq === requestSeqRef.current) {
        setRegistering(false);
      }
    }
  };

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
      <OneLinkCardHeader
        loaded={loaded}
        loading={loading}
        controlsBusy={controlsBusy}
        onRefresh={() => void loadConfig(true)}
      />

      {loading && !loaded && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 text-center text-xs text-slate-500">
          正在加载万联单点登录配置…
        </div>
      )}

      {!loaded && loadError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadConfig(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重新加载
          </button>
        </div>
      )}

      {loaded && (
        <>
          {loadError && (
            <div className="rounded-lg px-3.5 py-2.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>刷新万联配置失败：{loadError}</span>
            </div>
          )}

          {loaded.runtime.tokenVerificationMode === 'payload_sub_unverified' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1 text-xs text-amber-900">
                <div className="font-semibold">
                  联调风险提示（{loaded.runtime.tokenVerificationMode}）
                </div>
                <p className="leading-relaxed">
                  当前采用 Base64URL 载荷直解取
                  sub（未做加密验签），默认关闭，仅用于开发/受控联调环境
                </p>
              </div>
            </div>
          )}

          <RuntimeReadinessSection runtime={loaded.runtime} />

          <RegistrationStatusSection
            config={loaded.config}
            runtimeConfigured={loaded.runtime.configured}
            disabled={loading || saving}
            registering={registering}
            feedback={registerFeedback}
            onRegister={() => void handleRegister()}
          />

          <OneLinkControlsSection
            runtimeConfigured={loaded.runtime.configured}
            enabled={enabled}
            expectedClientIdInput={expectedClientIdInput}
            expectedClientIdError={expectedClientIdError}
            controlsBusy={controlsBusy}
            loading={loading}
            saving={saving}
            isDirty={isDirty}
            canSave={canSave}
            conflictError={conflictError}
            saveError={saveError}
            notice={notice}
            onToggleEnabled={() => {
              setEnabled((prev) => !prev);
              setNotice(null);
            }}
            onExpectedClientIdChange={(next) => {
              setExpectedClientIdInput(next);
              setNotice(null);
            }}
            onReload={() => void loadConfig(true)}
            onResetDraft={handleResetDraft}
            onSave={() => void handleSave()}
          />
        </>
      )}
    </section>
  );
}
