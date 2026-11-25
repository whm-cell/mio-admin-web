import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError, adminApi } from '../api';
import type {
  AuthSmsMode,
  GlobalSettingsData,
  GlobalSettingsResponse,
  GlobalSettingsRuntimeInfo,
} from '../types';
import { OneLinkSsoSettingsCard } from './OneLinkSsoSettingsCard';

const SIX_DIGIT_CODE_RE = /^\d{6}$/;

const SMS_MODE_OPTIONS: {
  mode: AuthSmsMode;
  title: string;
  description: string;
  badge?: { text: string; className: string };
}[] = [
  {
    mode: 'live',
    title: '开启真实短信验证',
    description: '走腾讯云短信下发与单次随机码校验（需服务端已配置短信凭据）。',
    badge: { text: '推荐默认', className: 'bg-emerald-100 text-emerald-800' },
  },
  {
    mode: 'bypass',
    title: '关闭真实短信验证（固定 6 位验证码登录）',
    description:
      '点击发码不扣真实短信，用户输入下方后台设置的固定 6 位验证码即可跳过发短信直接登录。',
    badge: { text: '高风险', className: 'bg-amber-100 text-amber-800' },
  },
  {
    mode: 'disabled',
    title: '完全关闭手机验证码入口',
    description: '手机登录与手机号绑定均返回 503 SMS_UNAVAILABLE。',
    badge: { text: '停用入口', className: 'bg-slate-200 text-slate-700' },
  },
];

function validateBypassCode(smsMode: AuthSmsMode, normalizedCode: string | null): string | null {
  if (smsMode === 'bypass') {
    if (normalizedCode === null) {
      return '固定验证码模式下必须设置 6 位数字验证码';
    }
    if (!SIX_DIGIT_CODE_RE.test(normalizedCode)) {
      return '固定验证码必须为 6 位纯数字（0-9）';
    }
    return null;
  }

  if (normalizedCode !== null && !SIX_DIGIT_CODE_RE.test(normalizedCode)) {
    return '若保留固定验证码，必须为 6 位纯数字（0-9），或清空后保存';
  }
  return null;
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return '—';
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return updatedAt;
  return parsed.toLocaleString('zh-CN');
}

interface StatusSummaryCardProps {
  settings: GlobalSettingsData;
  loading: boolean;
  saving: boolean;
  onRefresh: () => void;
}

function StatusSummaryCard({ settings, loading, saving, onRefresh }: StatusSummaryCardProps) {
  const isDefaultConfig = settings.revision === 0;

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {isDefaultConfig
                ? '使用环境变量默认配置，尚未入库'
                : `当前配置版本 v${settings.revision}`}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium font-mono ${
                isDefaultConfig ? 'bg-slate-100 text-slate-700' : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              revision #{settings.revision}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            最近更新人：{settings.updatedBy ?? '尚未修改'} · 最近更新时间：
            {formatUpdatedAt(settings.updatedAt)}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={loading || saving}
        onClick={onRefresh}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? '刷新中…' : '刷新配置'}
      </button>
    </div>
  );
}

interface EmailPasswordCardProps {
  enabled: boolean;
  envDefault: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}

function EmailPasswordCard({ enabled, envDefault, disabled, onToggle }: EmailPasswordCardProps) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">邮箱密码登录开关</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
          环境变量默认：{envDefault ? '开启' : '关闭'}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">
              允许邮箱密码注册、登录与修改密码
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {enabled ? '已开启' : '已关闭'}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            保存后热生效、无需重启；关闭后注册、登录与修改密码立即返回{' '}
            <code className="font-mono text-slate-700">503</code>
            ，不影响既有有效会话与手机 / 微信登录。
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="邮箱密码登录开关"
          disabled={disabled}
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 cursor-pointer ${
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
    </section>
  );
}

interface SmsPolicyCardProps {
  smsMode: AuthSmsMode;
  smsBypassCode: string;
  savedBypassCode: string | null;
  runtime: GlobalSettingsRuntimeInfo;
  codeError: string | null;
  disabled: boolean;
  onModeChange: (nextMode: AuthSmsMode) => void;
  onBypassCodeChange: (nextCode: string) => void;
}

function SmsPolicyCard({
  smsMode,
  smsBypassCode,
  savedBypassCode,
  runtime,
  codeError,
  disabled,
  onModeChange,
  onBypassCodeChange,
}: SmsPolicyCardProps) {
  const showRetainedCodeEditor =
    smsMode !== 'bypass' && (smsBypassCode.trim() !== '' || savedBypassCode !== null);

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">手机验证码策略</h3>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
            runtime.smsProviderConfigured
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {runtime.smsProviderConfigured ? '已配置腾讯云短信凭据' : '未配置腾讯云短信凭据'}
        </span>
      </div>

      <div className="space-y-2.5" role="radiogroup" aria-label="手机验证码策略">
        {SMS_MODE_OPTIONS.map((option) => {
          const selected = smsMode === option.mode;
          const borderClass = selected
            ? option.mode === 'bypass'
              ? 'border-amber-400 bg-amber-50/40'
              : 'border-indigo-500 bg-indigo-50/40'
            : 'border-slate-200 hover:border-slate-300 bg-white';

          return (
            <label
              key={option.mode}
              className={`flex items-start gap-3 rounded-xl border p-3.5 transition cursor-pointer ${borderClass} ${
                disabled ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <input
                type="radio"
                name="smsMode"
                value={option.mode}
                checked={selected}
                disabled={disabled}
                onChange={() => onModeChange(option.mode)}
                className="mt-0.5 h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">{option.title}</span>
                  {option.badge && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${option.badge.className}`}
                    >
                      {option.badge.text}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{option.description}</p>
                {option.mode === 'live' && selected && !runtime.smsProviderConfigured && (
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    提示：当前服务端未检测到腾讯云短信凭据，开启真实短信验证后实际发码将失败，请确认环境变量已配置。
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {smsMode === 'bypass' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-xl border border-rose-200 bg-gradient-to-r from-amber-50 to-rose-50 px-4 py-3.5 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs text-rose-900">
              <div className="font-semibold">高风险安全提示：固定 6 位验证码登录</div>
              <p className="leading-relaxed text-rose-800">
                开启后，任何知晓用户手机号与该固定 6 位验证码的人均可跳过短信验证直接登录对应账号，
                存在严重的账号接管风险；严禁在公开生产环境长期保留此模式。
              </p>
              <p className="leading-relaxed text-amber-900">
                注意：手机号绑定流程（<code className="font-mono">/api/auth/phone-binding/*</code>
                ）不遵循此固定码策略，仍需真实短信校验或受停用策略约束。
              </p>
            </div>
          </div>

          <div className="max-w-md space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="global-settings-bypass-code"
                className="block text-xs font-medium text-slate-700"
              >
                固定 6 位数字验证码 *
              </label>
              <span className="text-[11px] text-slate-500">仅限 6 位纯数字（0-9）</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="global-settings-bypass-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                disabled={disabled}
                value={smsBypassCode}
                onChange={(e) => onBypassCodeChange(e.target.value)}
                placeholder="输入 6 位数字验证码，例如 888888"
                className={`w-full px-3.5 py-2 text-xs font-mono tracking-widest rounded-lg border outline-none ${
                  codeError
                    ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                    : 'border-slate-300 focus:border-indigo-500 bg-white'
                }`}
              />
              {smsBypassCode !== '' && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onBypassCodeChange('')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" /> 清空
                </button>
              )}
            </div>
            {codeError && <p className="text-xs text-rose-600">{codeError}</p>}
          </div>
        </div>
      )}

      {showRetainedCodeEditor && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label
                htmlFor="global-settings-retained-bypass-code"
                className="block text-xs font-medium text-slate-800"
              >
                已保存的固定 6 位验证码（当前模式下不生效）
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                可点击「清空」在保存时一并清除服务端已存固定码，或保留 6 位数字以便后续切换。
              </p>
            </div>
            {smsBypassCode !== '' && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onBypassCodeChange('')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> 清空验证码
              </button>
            )}
          </div>

          <div className="max-w-md space-y-1">
            <input
              id="global-settings-retained-bypass-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              disabled={disabled}
              value={smsBypassCode}
              onChange={(e) => onBypassCodeChange(e.target.value)}
              placeholder="留空则保存时清除已存固定验证码"
              className={`w-full px-3.5 py-2 text-xs font-mono tracking-widest rounded-lg border bg-white outline-none ${
                codeError
                  ? 'border-rose-400 focus:border-rose-500'
                  : 'border-slate-300 focus:border-indigo-500'
              }`}
            />
            {codeError && <p className="text-xs text-rose-600">{codeError}</p>}
            {!codeError && smsBypassCode.trim() === '' && savedBypassCode !== null && (
              <p className="text-[11px] text-slate-500">
                保存后将清空服务端已存储的固定验证码（提交 null）。
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface SettingsActionBarProps {
  isDirty: boolean;
  canSave: boolean;
  loading: boolean;
  saving: boolean;
  conflictError: string | null;
  saveError: string | null;
  notice: string | null;
  onReload: () => void;
  onResetDraft: () => void;
}

function SettingsActionBar({
  isDirty,
  canSave,
  loading,
  saving,
  conflictError,
  saveError,
  notice,
  onReload,
  onResetDraft,
}: SettingsActionBarProps) {
  return (
    <>
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

      <div className="rounded-xl bg-white border border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {isDirty ? (
            <span className="font-medium text-amber-700">当前存在未保存的配置修改</span>
          ) : (
            <span className="text-slate-500">当前配置与服务端已生效版本一致</span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {isDirty && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={onResetDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              还原未保存修改
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中…' : '保存全局配置'}
          </button>
        </div>
      </div>
    </>
  );
}

export function GlobalSettingsPage() {
  const [loaded, setLoaded] = useState<GlobalSettingsResponse | null>(null);
  const [emailPasswordEnabled, setEmailPasswordEnabled] = useState(true);
  const [smsMode, setSmsMode] = useState<AuthSmsMode>('live');
  const [smsBypassCode, setSmsBypassCode] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const syncFromResponse = useCallback((res: GlobalSettingsResponse) => {
    setLoaded(res);
    setEmailPasswordEnabled(res.settings.auth.emailPasswordEnabled);
    setSmsMode(res.settings.auth.smsMode);
    setSmsBypassCode(res.settings.auth.smsBypassCode ?? '');
  }, []);

  const loadSettings = useCallback(
    async (clearFeedback = true) => {
      setLoading(true);
      setLoadError(null);
      if (clearFeedback) {
        setSaveError(null);
        setConflictError(null);
        setNotice(null);
      }
      try {
        const res = await adminApi.getGlobalSettings();
        syncFromResponse(res);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : '加载全局配置失败');
      } finally {
        setLoading(false);
      }
    },
    [syncFromResponse],
  );

  useEffect(() => {
    void loadSettings(false);
  }, [loadSettings]);

  const trimmedCode = smsBypassCode.trim();
  const normalizedCode: string | null = trimmedCode === '' ? null : trimmedCode;
  const codeError = validateBypassCode(smsMode, normalizedCode);

  const isDirty =
    loaded !== null &&
    (emailPasswordEnabled !== loaded.settings.auth.emailPasswordEnabled ||
      smsMode !== loaded.settings.auth.smsMode ||
      normalizedCode !== loaded.settings.auth.smsBypassCode);

  const canSave = loaded !== null && isDirty && codeError === null && !saving && !loading;

  const handleResetDraft = () => {
    if (!loaded) return;
    setEmailPasswordEnabled(loaded.settings.auth.emailPasswordEnabled);
    setSmsMode(loaded.settings.auth.smsMode);
    setSmsBypassCode(loaded.settings.auth.smsBypassCode ?? '');
    setSaveError(null);
    setConflictError(null);
    setNotice(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!loaded || codeError !== null || !isDirty || saving || loading) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setConflictError(null);
    setNotice(null);

    try {
      const res = await adminApi.updateGlobalSettings({
        expectedRevision: loaded.settings.revision,
        auth: {
          emailPasswordEnabled,
          smsMode,
          smsBypassCode: normalizedCode,
        },
      });
      syncFromResponse(res);
      setNotice(
        `全局配置已更新至 v${res.settings.revision} 并立即热生效，本次操作审计已记录至「变更记录与回滚」。`,
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SETTINGS_CONFLICT') {
        setConflictError(err.message);
      } else {
        setSaveError(err instanceof Error ? err.message : '保存全局配置失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {loading && !loaded ? (
        <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
          正在加载全局配置…
        </div>
      ) : !loaded ? (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{loadError ?? '无法获取当前全局配置'}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadSettings(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重新加载
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <StatusSummaryCard
            settings={loaded.settings}
            loading={loading}
            saving={saving}
            onRefresh={() => void loadSettings(true)}
          />

          {loadError && (
            <div className="rounded-lg px-3.5 py-2.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>刷新配置失败：{loadError}</span>
            </div>
          )}

          <EmailPasswordCard
            enabled={emailPasswordEnabled}
            envDefault={loaded.runtime.envEmailPasswordDefault}
            disabled={saving || loading}
            onToggle={(next) => {
              setEmailPasswordEnabled(next);
              setNotice(null);
            }}
          />

          <SmsPolicyCard
            smsMode={smsMode}
            smsBypassCode={smsBypassCode}
            savedBypassCode={loaded.settings.auth.smsBypassCode}
            runtime={loaded.runtime}
            codeError={codeError}
            disabled={saving || loading}
            onModeChange={(nextMode) => {
              setSmsMode(nextMode);
              setNotice(null);
            }}
            onBypassCodeChange={(nextCode) => {
              setSmsBypassCode(nextCode);
              setNotice(null);
            }}
          />

          <SettingsActionBar
            isDirty={isDirty}
            canSave={canSave}
            loading={loading}
            saving={saving}
            conflictError={conflictError}
            saveError={saveError}
            notice={notice}
            onReload={() => void loadSettings(true)}
            onResetDraft={handleResetDraft}
          />
        </form>
      )}

      <OneLinkSsoSettingsCard />
    </div>
  );
}
