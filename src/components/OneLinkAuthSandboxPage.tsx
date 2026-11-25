import {
  AlertTriangle,
  CheckCircle2,
  Info,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiClientError, userAuthApi } from '../api';
import {
  INIT_PENDING,
  INIT_SESSION,
  SANDBOX_RETURN_PATH,
  buildCleanedSandboxUrl,
  classifyPendingError,
  errMsg,
  formatTs,
  isSafeRedirectUrl,
  parseOneLinkCallbackResult,
  resolvePendingRefresh,
  resolveSessionRefresh,
} from './oneLinkSandboxHelpers';
import type {
  InlineErrorFeedback,
  OneLinkCallbackBanner,
  PendingState,
  SandboxBannerTone,
  SessionState,
} from './oneLinkSandboxHelpers';

const SIX_DIGIT_OTP_RE = /^\d{6}$/;

const OTP_FLOWS = {
  phone_login: {
    placeholder: '如 13800138000 或 +8613800138000',
    label: '测试老号手机号',
    sendLabel: '发送验证码',
    submitLabel: '验证码登录',
    sentMsg: '登录验证码已发送（固定验证码模式下填入后台 6 位固定码即可）。',
    send: (p: string) => userAuthApi.sendPhoneLoginOtp(p),
    submit: async (p: string, c: string) => {
      await userAuthApi.verifyPhoneLogin(p, c);
      return '手机号登录成功，请记录 userId 后按需退出以测试万联回绑。';
    },
  },
  phone_binding: {
    placeholder: '输入空闲手机号（如 13800138000）',
    label: '补绑空闲手机号',
    sendLabel: '发送验证码',
    submitLabel: '确认补绑',
    sentMsg: '补绑验证码已通过真实短信下发，请输入 6 位验证码完成补绑。',
    send: (p: string) => userAuthApi.sendPhoneBindingOtp(p),
    submit: async (p: string, c: string) => {
      await userAuthApi.confirmPhoneBinding(p, c);
      return '空闲手机号补绑成功，已更新当前 C 端账号资料。';
    },
  },
  onelink_existing: {
    placeholder: '已有 Mio 账号手机号',
    label: '已有 Mio 账号手机号',
    sendLabel: '发送绑定验证码',
    submitLabel: '确认绑定并登录',
    sentMsg: '绑定验证码已通过真实短信下发（严格不走固定验证码 bypass 模式）。',
    send: (p: string) => userAuthApi.sendOneLinkExistingOtp(p),
    submit: async (p: string, c: string, token?: string) => {
      const r = await userAuthApi.completeOneLink({
        action: 'link_existing',
        candidateToken: token ?? '',
        phoneNumber: p,
        code: c,
      });
      return `已绑定已有 Mio 账号并登录（userId: ${r.userId}）。`;
    },
  },
};

type OtpMode = keyof typeof OTP_FLOWS;

const SUBCARD = 'rounded-xl border border-slate-200 bg-slate-50/60 p-4';
const INPUT =
  'flex-1 min-w-0 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:border-indigo-500 outline-none';

const BTN_CLS = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 disabled:opacity-45',
  indigo:
    'border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 disabled:opacity-40',
  subtle:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 px-3 py-1.5 disabled:opacity-50',
  danger:
    'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 px-3 py-1.5 disabled:opacity-50',
};

const TONE_CLS: Record<SandboxBannerTone, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  info: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
};

function Btn(p: {
  variant: keyof typeof BTN_CLS;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={p.disabled}
      onClick={p.onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-medium cursor-pointer shrink-0 ${BTN_CLS[p.variant]}`}
    >
      {p.children}
    </button>
  );
}

function SectionCard(p: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {p.icon}
          <h3 className="text-sm font-semibold text-slate-900">{p.title}</h3>
          {p.badge}
        </div>
        {p.right && <div className="flex items-center gap-2">{p.right}</div>}
      </div>
      {p.children}
    </section>
  );
}

function AlertBox(p: {
  tone: SandboxBannerTone;
  title?: string;
  message: string;
  hint?: string;
  onClose?: () => void;
}) {
  const Icon = p.tone === 'success' ? CheckCircle2 : p.tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-start justify-between gap-3 ${TONE_CLS[p.tone]}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-0.5 min-w-0">
          {p.title && <div className="font-semibold">{p.title}</div>}
          <p className="leading-relaxed">{p.message}</p>
          {p.hint && <p className="text-[11px] opacity-90">{p.hint}</p>}
        </div>
      </div>
      {p.onClose && (
        <button
          type="button"
          onClick={p.onClose}
          aria-label="关闭提示"
          className="p-1 rounded hover:bg-black/5 shrink-0 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Pill(p: { active: boolean; yes: string; no: string; warn?: boolean }) {
  const cls = p.active
    ? 'bg-emerald-100 text-emerald-800'
    : p.warn
      ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-200 text-slate-600';
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {p.active ? p.yes : p.no}
    </span>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-900 break-all ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

function PhoneOtpForm(p: {
  mode: OtpMode;
  candidateToken?: string;
  stacked?: boolean;
  disabled?: boolean;
  onSuccess: (notice: string) => Promise<void>;
  mapError?: (err: unknown, fallback: string) => Promise<InlineErrorFeedback>;
}) {
  const flow = OTP_FLOWS[p.mode];
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'submitting'>('idle');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [error, setError] = useState<InlineErrorFeedback | null>(null);
  const busy = Boolean(p.disabled) || phase !== 'idle';

  const run = (next: 'sending' | 'submitting', fb: string, task: () => Promise<void>) => {
    setPhase(next);
    setError(null);
    if (next === 'sending') setOtpNotice(null);
    void task()
      .catch(async (err: unknown) =>
        setError(
          p.mapError ? await p.mapError(err, fb) : { tone: 'error', message: errMsg(err, fb) },
        ),
      )
      .finally(() => setPhase('idle'));
  };

  const onSend = () => {
    const trimmed = phone.trim();
    if (!trimmed) return setError({ tone: 'error', message: '请输入手机号后再发送验证码' });
    run('sending', '发送验证码失败', async () => {
      await flow.send(trimmed);
      setOtpNotice(flow.sentMsg);
    });
  };

  const onSubmit = () => {
    const tp = phone.trim();
    const tc = code.trim();
    if (!tp) return setError({ tone: 'error', message: '请输入手机号' });
    if (!SIX_DIGIT_OTP_RE.test(tc))
      return setError({ tone: 'error', message: '请输入 6 位数字验证码' });
    run('submitting', '提交验证失败', async () => {
      const msg = await flow.submit(tp, tc, p.candidateToken);
      setPhone('');
      setCode('');
      setOtpNotice(null);
      await p.onSuccess(msg);
    });
  };

  return (
    <div className="space-y-2.5">
      <div className={p.stacked ? 'space-y-2.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            disabled={busy}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={flow.placeholder}
            aria-label={flow.label}
            className={INPUT}
          />
          <Btn variant="indigo" disabled={busy} onClick={onSend}>
            {phase === 'sending' ? '发送中…' : flow.sendLabel}
          </Btn>
        </div>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入 6 位验证码"
            aria-label={`${flow.label}验证码`}
            className={`${INPUT} tracking-widest`}
          />
          <Btn variant="primary" disabled={busy} onClick={onSubmit}>
            {phase === 'submitting' ? '提交中…' : flow.submitLabel}
          </Btn>
        </div>
      </div>
      {otpNotice && <AlertBox tone="info" message={otpNotice} />}
      {error && <AlertBox tone={error.tone} message={error.message} hint={error.hint} />}
    </div>
  );
}

function SessionProfilePanel(p: {
  state: SessionState;
  signingOut: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  onSessionUpdated: (msg: string) => Promise<void>;
}) {
  const { session, profile, loading, error } = p.state;
  return (
    <SectionCard
      icon={<UserCheck className="h-4 w-4 text-indigo-600" />}
      title="1. 当前 C 端会话与账号资料"
      badge={<Pill active={session !== null} yes="已登录 C 端" no="未登录 C 端" />}
      right={
        <>
          <Btn variant="subtle" disabled={loading || p.signingOut} onClick={p.onRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '刷新中…' : '刷新状态'}
          </Btn>
          {session && (
            <Btn variant="danger" disabled={p.signingOut || loading} onClick={p.onSignOut}>
              {p.signingOut ? '退出中…' : '退出 C 端会话'}
            </Btn>
          )}
        </>
      }
    >
      {error && <AlertBox tone="error" message={error} />}
      {session && profile ? (
        <div className="space-y-4">
          <dl className={`${SUBCARD} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs`}>
            <Field label="userId" mono>
              {profile.userId}
            </Field>
            <Field label="displayId / 昵称">
              <span className="font-mono">{profile.displayId ?? '—'}</span> · {profile.name}
            </Field>
            <Field label="sessionId" mono>
              {session.sessionId}
            </Field>
            <Field label="手机号 / 验证状态">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-mono">{profile.phoneNumber ?? '未绑定'}</span>
                <Pill active={profile.phoneNumberVerified} yes="已验证" no="未验证" />
              </span>
            </Field>
            <Field label="微信绑定">
              <Pill active={profile.wechatBound} yes="已绑定" no="未绑定" />
            </Field>
            <Field label="万联绑定（onelinkBound）">
              <Pill active={profile.onelinkBound} yes="已绑定万联" no="未绑定万联" warn />
            </Field>
          </dl>
          {!profile.phoneNumber && (
            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-900">
                补绑空闲手机号（可选，严格走真实短信校验）
              </div>
              <PhoneOtpForm mode="phone_binding" onSuccess={p.onSessionUpdated} />
            </div>
          )}
        </div>
      ) : !loading ? (
        <details open className={`${SUBCARD} space-y-3`}>
          <summary className="text-xs font-semibold text-slate-900 cursor-pointer">
            手机号验证码登录（准备测试老号）
            <span className="font-normal text-[11px] text-slate-500 ml-1.5">
              记下老号 userId 后退出，再验证万联回绑
            </span>
          </summary>
          <PhoneOtpForm mode="phone_login" onSuccess={p.onSessionUpdated} />
        </details>
      ) : (
        <div className={`${SUBCARD} p-6 text-center text-xs text-slate-500`}>
          正在检查 C 端会话状态…
        </div>
      )}
    </SectionCard>
  );
}

function OneLinkPendingPanel(p: {
  pendingState: PendingState;
  sessionState: SessionState;
  onRefreshAll: (notice?: string) => Promise<void>;
}) {
  const { pending, loading, error } = p.pendingState;
  const { session, profile } = p.sessionState;
  const [submitting, setSubmitting] = useState<'create' | 'bind_current' | 'cancel' | null>(null);
  const [panelError, setPanelError] = useState<InlineErrorFeedback | null>(null);
  const busy = submitting !== null;

  const mapErr = async (err: unknown, fb: string): Promise<InlineErrorFeedback> => {
    const { feedback, shouldRefresh } = classifyPendingError(err, fb);
    if (shouldRefresh) {
      setPanelError(feedback);
      await p.onRefreshAll();
    }
    return feedback;
  };

  const runAction = (kind: 'create' | 'bind_current' | 'cancel') => {
    setSubmitting(kind);
    setPanelError(null);
    const task =
      kind === 'cancel'
        ? userAuthApi.cancelOneLinkPending().then(() => '已取消本次待确认的万联授权会话。')
        : userAuthApi
            .completeOneLink({ action: kind, candidateToken: pending?.candidateToken ?? '' })
            .then((res) =>
              kind === 'create'
                ? `已通过万联创建新 Mio 账号并登录（userId: ${res.userId}）。`
                : res.alreadyBound
                  ? `该万联账号已绑定至当前账号（幂等确认，userId: ${res.userId}）。`
                  : `已成功将万联账号绑定至当前 C 端账号（userId: ${res.userId}）。`,
            );
    void task
      .then((msg) => p.onRefreshAll(msg))
      .catch(async (err: unknown) => setPanelError(await mapErr(err, '执行万联待确认操作失败')))
      .finally(() => setSubmitting(null));
  };

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4 text-indigo-600" />}
      title="3. 待确认万联授权（Pending）"
      badge={
        pending && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800">
            {pending.intent === 'login' ? '首次登录二选一' : '确认绑定当前账号'}
          </span>
        )
      }
      right={
        pending && (
          <Btn variant="subtle" disabled={busy} onClick={() => runAction('cancel')}>
            <X className="h-3.5 w-3.5" />
            {submitting === 'cancel' ? '取消中…' : '取消本次操作'}
          </Btn>
        )
      }
    >
      {error && <AlertBox tone="error" message={error} />}
      {panelError && (
        <AlertBox
          tone={panelError.tone}
          message={panelError.message}
          hint={panelError.hint}
          onClose={() => setPanelError(null)}
        />
      )}
      {loading && !pending ? (
        <div className={`${SUBCARD} p-6 text-center text-xs text-slate-500`}>
          正在查询待确认会话…
        </div>
      ) : !pending ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
          当前没有待确认的万联授权会话。发起万联登录或绑定并完成回调后，此处会自动显示待确认信息。
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 text-xs">
            <Field label="万联账号 ID" mono>
              <span className="font-semibold">{pending.onelinkSub}</span>
            </Field>
            <Field label="回调 clientId" mono>
              {pending.clientId ?? '—'}
            </Field>
            <Field label="凭证过期时间">{formatTs(pending.expiresAt)}</Field>
          </dl>

          {pending.intent === 'login' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${SUBCARD} flex flex-col items-start justify-between gap-4`}>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong className="block text-slate-900 mb-1">创建新账号</strong>
                  使用万联账号 ID <code className="font-mono">{pending.onelinkSub}</code>{' '}
                  直接创建全新 Mio 账号并登录；创建后可在上方补绑空闲手机号。
                </p>
                <Btn variant="primary" disabled={busy} onClick={() => runAction('create')}>
                  {submitting === 'create' ? '正在创建账号…' : '创建新账号并登录'}
                </Btn>
              </div>
              <div className={`${SUBCARD} space-y-2.5`}>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <strong className="block text-xs text-slate-900 mb-1">绑定已有 Mio 账号</strong>
                  校验老号手机号短信验证码完成绑定。
                  <span className="font-medium text-amber-800">
                    严格使用真实短信，不走固定验证码 bypass。
                  </span>
                </p>
                <PhoneOtpForm
                  key={pending.candidateToken}
                  mode="onelink_existing"
                  candidateToken={pending.candidateToken}
                  stacked
                  disabled={busy}
                  onSuccess={async (msg) => {
                    setPanelError(null);
                    await p.onRefreshAll(msg);
                  }}
                  mapError={mapErr}
                />
              </div>
            </div>
          ) : (
            <div className={`${SUBCARD} space-y-4`}>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-white border border-slate-200 p-3 text-xs">
                <Field label="当前 C 端 Mio 账号">
                  <span className="font-mono">
                    {profile?.userId ?? session?.userId ?? '未检测到会话'}
                  </span>
                  <div className="text-slate-600 mt-0.5">
                    手机号：<span className="font-mono">{profile?.phoneNumber ?? '未绑定'}</span>
                  </div>
                </Field>
                <Field label="待绑定万联账号 ID">
                  <span className="font-mono font-semibold text-indigo-700">
                    {pending.onelinkSub}
                  </span>
                  <div className="text-slate-600 mt-0.5">
                    clientId：<span className="font-mono">{pending.clientId ?? '—'}</span>
                  </div>
                </Field>
              </dl>
              <div className="flex flex-wrap items-center gap-2.5">
                <Btn
                  variant="primary"
                  disabled={busy || !session}
                  onClick={() => runAction('bind_current')}
                >
                  {submitting === 'bind_current' ? '正在确认绑定…' : '确认绑定'}
                </Btn>
                <Btn variant="subtle" disabled={busy} onClick={() => runAction('cancel')}>
                  取消
                </Btn>
                {!session && (
                  <span className="text-[11px] text-amber-700">
                    请先登录 C 端账号后再确认绑定。
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export function OneLinkAuthSandboxPage() {
  const [callbackBanner, setCallbackBanner] = useState<OneLinkCallbackBanner | null>(() =>
    parseOneLinkCallbackResult(window.location.search),
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>(INIT_SESSION);
  const [pendingState, setPendingState] = useState<PendingState>(INIT_PENDING);
  const [signingOut, setSigningOut] = useState(false);
  const [startingIntent, setStartingIntent] = useState<'login' | 'bind' | null>(null);
  const [actionError, setActionError] = useState<{ code: string | null; message: string } | null>(
    null,
  );
  const refreshSeqRef = useRef(0);

  const refreshAll = useCallback(async (notice?: string) => {
    const seq = ++refreshSeqRef.current;
    if (notice !== undefined) setStatusNotice(notice);
    setSessionState((p) => ({ ...p, loading: true, error: null }));
    setPendingState((p) => ({ ...p, loading: true, error: null }));

    const [sessionRes, pendingRes] = await Promise.allSettled([
      userAuthApi.me().then(async (session) => ({ session, profile: await userAuthApi.profile() })),
      userAuthApi.getOneLinkPending(),
    ]);
    if (seq !== refreshSeqRef.current) return;

    setSessionState((p) => resolveSessionRefresh(sessionRes, p));
    setPendingState(resolvePendingRefresh(pendingRes));
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('onelink_result')) {
      window.history.replaceState(null, '', buildCleanedSandboxUrl(window.location.href));
    }
    void refreshAll();
  }, [refreshAll]);

  const handleSignOut = async () => {
    setSigningOut(true);
    setActionError(null);
    try {
      await userAuthApi.signOut();
      await refreshAll('已退出当前 C 端会话（管理员后台会话未受影响）。');
    } catch (err) {
      setSessionState((p) => ({ ...p, error: errMsg(err, '退出 C 端会话失败') }));
    } finally {
      setSigningOut(false);
    }
  };

  const handleStart = async (intent: 'login' | 'bind') => {
    setStartingIntent(intent);
    setActionError(null);
    try {
      const res = await userAuthApi.startOneLink(intent, SANDBOX_RETURN_PATH);
      if (!isSafeRedirectUrl(res.url)) throw new Error('服务端返回了无效的万联授权跳转地址');
      window.location.assign(res.url);
    } catch (err) {
      setActionError({
        code: err instanceof ApiClientError ? err.code : null,
        message: errMsg(err, '发起万联授权失败'),
      });
      setStartingIntent(null);
    }
  };

  const { session, profile } = sessionState;
  const canBind = session !== null && profile !== null && !profile.onelinkBound;
  const bindHint = !session
    ? '请先登录一个 C 端账号后再发起绑定'
    : profile?.onelinkBound
      ? '当前 C 端账号已绑定万联，无需重复绑定'
      : '绑定要求当前 C 端会话签发在 10 分钟内，超时请先退出重登';

  return (
    <div className="max-w-4xl space-y-5">
      <AlertBox
        tone="info"
        title="Cookie 隔离说明（同浏览器安全联调）"
        message="管理后台使用 mio.admin_session，C 端用户会话使用独立的 mio.session_token。在本沙箱页执行 C 端登录、万联回调或退出 C 端会话均不会影响当前管理员登录态。"
      />
      {callbackBanner && (
        <AlertBox
          tone={callbackBanner.tone}
          title={callbackBanner.title}
          message={callbackBanner.description}
          onClose={() => setCallbackBanner(null)}
        />
      )}
      {statusNotice && (
        <AlertBox tone="success" message={statusNotice} onClose={() => setStatusNotice(null)} />
      )}
      <SessionProfilePanel
        state={sessionState}
        signingOut={signingOut}
        onRefresh={() => void refreshAll()}
        onSignOut={() => void handleSignOut()}
        onSessionUpdated={refreshAll}
      />
      <SectionCard
        icon={<KeyRound className="h-4 w-4 text-indigo-600" />}
        title="2. 发起万联授权操作"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`${SUBCARD} flex flex-col items-start justify-between gap-3`}>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">万联登录入口：</strong>
              发起 <code className="font-mono">login</code>{' '}
              跳转万联授权；已绑定直接登录，未绑定返回本页二选一。
            </p>
            <Btn
              variant="primary"
              disabled={startingIntent !== null}
              onClick={() => void handleStart('login')}
            >
              {startingIntent === 'login' ? '正在跳转万联授权…' : '使用万联登录'}
            </Btn>
          </div>
          <div className={`${SUBCARD} flex flex-col items-start justify-between gap-3`}>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">绑定当前 C 端账号：</strong>
              发起 <code className="font-mono">bind</code> 跳转万联授权，回调后确认绑定。
              <span className="block text-[11px] text-slate-500 mt-1">{bindHint}</span>
            </p>
            <Btn
              variant="indigo"
              disabled={!canBind || startingIntent !== null}
              onClick={() => void handleStart('bind')}
            >
              <Link2 className="h-3.5 w-3.5" />
              {startingIntent === 'bind' ? '正在跳转万联授权…' : '绑定当前 C 端账号'}
            </Btn>
          </div>
        </div>
        {actionError && (
          <AlertBox
            tone={actionError.code === 'SESSION_REQUIRED' ? 'warning' : 'error'}
            title={
              actionError.code === 'SESSION_REQUIRED'
                ? 'C 端会话已超过 10 分钟安全绑定窗口，请退出重登 C 端账号后再重新发起「绑定当前 C 端账号」'
                : '发起万联授权失败'
            }
            message={actionError.message}
          />
        )}
      </SectionCard>
      <OneLinkPendingPanel
        pendingState={pendingState}
        sessionState={sessionState}
        onRefreshAll={refreshAll}
      />
    </div>
  );
}
