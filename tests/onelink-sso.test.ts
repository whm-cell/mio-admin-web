import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveInitialNav } from '../src/App';
import { ApiClientError, CODE_LABELS, adminApi, userAuthApi } from '../src/api';
import {
  formatRegisterOutcomeFeedback,
  getRegistrationStatusBadge,
  shouldPreserveDraftAfterRegister,
  validateExpectedClientId,
} from '../src/components/OneLinkSsoSettingsCard';
import {
  INIT_SESSION,
  SANDBOX_RETURN_PATH,
  buildCleanedSandboxUrl,
  classifyPendingError,
  isSafeRedirectUrl,
  parseOneLinkCallbackResult,
  resolvePendingRefresh,
  resolveSessionRefresh,
} from '../src/components/oneLinkSandboxHelpers';
import type { AdminOneLinkSsoView, RegisterOneLinkSsoResponse } from '../src/types';
import { parseAllowedHosts } from '../vite.config';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSampleSsoView(overrides: Partial<AdminOneLinkSsoView> = {}): AdminOneLinkSsoView {
  return {
    config: {
      environment: 'dev',
      enabled: false,
      clientName: 'miioo',
      clientId: null,
      expectedClientId: null,
      registrationStatus: 'unregistered',
      registrationSource: null,
      lastRegisterCode: null,
      lastRegisterTraceId: null,
      lastRegisterMessage: null,
      lastRegisteredAt: null,
      revision: 0,
      updatedBy: null,
      updatedAt: null,
      ...(overrides.config ?? {}),
    },
    runtime: {
      configured: true,
      hasEncryptionKey: true,
      authorizeOrigin: 'https://sso.example.test',
      registerOrigin: 'https://register.example.test',
      callbackUrl: 'https://app.example.test/api/auth/callback/onelink',
      tokenVerificationMode: 'payload_sub_unverified',
      ...(overrides.runtime ?? {}),
    },
  };
}

describe('OneLink SSO CODE_LABELS coverage', () => {
  const REQUIRED_CODES = [
    'ONELINK_SSO_NOT_CONFIGURED',
    'ONELINK_REGISTER_IN_PROGRESS',
    'ONELINK_SSO_UNAVAILABLE',
    'ONELINK_CLIENT_NAME_INVALID',
    'ONELINK_CLIENT_TEMPLATE_MISSING',
    'ONELINK_REGISTER_UPSTREAM_FAILED',
    'ONELINK_UNAVAILABLE',
    'ONELINK_ALREADY_BOUND',
    'ONELINK_PENDING_NOT_FOUND',
    'ONELINK_PENDING_INVALID',
    'ONELINK_PENDING_ALREADY_COMPLETED',
    'EXISTING_PHONE_NOT_FOUND',
    'SESSION_REQUIRED',
    'INVALID_OTP',
    'INVALID_INPUT',
    'AUTH_UNAVAILABLE',
    'ACCOUNT_DISABLED',
    'PHONE_CONFLICT',
    'SMS_UNAVAILABLE',
    'SMS_RATE_LIMITED',
    'UNAUTHORIZED',
  ] as const;

  it('provides localized Chinese labels for all required OneLink & C-end auth error codes', () => {
    for (const code of REQUIRED_CODES) {
      expect(CODE_LABELS[code], `missing CODE_LABELS entry for ${code}`).toBeTruthy();
    }
    expect(CODE_LABELS.ONELINK_ALREADY_BOUND).toBe('该登录方式已绑定，暂不能完成本次操作');
    expect(CODE_LABELS.PHONE_CONFLICT).toBe('该登录方式已绑定，暂不能完成本次操作');
  });
});

describe('adminApi OneLink SSO endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET, PATCH, and POST register endpoints with exact paths, headers, and payloads', async () => {
    const initialView = makeSampleSsoView();
    const updatedView = makeSampleSsoView({
      config: {
        ...initialView.config,
        enabled: true,
        expectedClientId: 'miiooClientId',
        revision: 1,
        updatedBy: 'miioo_admin',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
    });
    const registerRes: RegisterOneLinkSsoResponse = {
      ...updatedView,
      config: {
        ...updatedView.config,
        clientId: 'miiooClientId',
        registrationStatus: 'registered',
        registrationSource: 'register_200',
        lastRegisterCode: 200,
        lastRegisterTraceId: 'trace_demo_200',
        revision: 2,
      },
      outcome: 'registered',
      upstreamCode: 200,
      errorCode: null,
      traceId: 'trace_demo_200',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(initialView))
      .mockResolvedValueOnce(jsonResponse(updatedView))
      .mockResolvedValueOnce(jsonResponse(registerRes));
    vi.stubGlobal('fetch', fetchMock);

    expect(await adminApi.getOneLinkSso()).toEqual(initialView);
    expect(
      await adminApi.updateOneLinkSso({
        expectedRevision: 0,
        enabled: true,
        expectedClientId: 'miiooClientId',
      }),
    ).toEqual(updatedView);
    expect(await adminApi.registerOneLinkSso()).toEqual(registerRes);

    const [getUrl, getInit] = fetchMock.mock.calls[0]!;
    expect(getUrl).toBe('/api/v1/admin/onelink/sso');
    expect(getInit?.method).toBeUndefined();
    expect(getInit?.credentials).toBe('include');
    expect(new Headers(getInit?.headers).has('Content-Type')).toBe(false);

    const [patchUrl, patchInit] = fetchMock.mock.calls[1]!;
    expect(patchUrl).toBe('/api/v1/admin/onelink/sso');
    expect(patchInit?.method).toBe('PATCH');
    expect(patchInit?.credentials).toBe('include');
    expect(new Headers(patchInit?.headers).get('Content-Type')).toBe('application/json');
    expect(patchInit?.body).toBe(
      JSON.stringify({ expectedRevision: 0, enabled: true, expectedClientId: 'miiooClientId' }),
    );

    const [regUrl, regInit] = fetchMock.mock.calls[2]!;
    expect(regUrl).toBe('/api/v1/admin/onelink/sso/register');
    expect(regInit?.method).toBe('POST');
    expect(regInit?.credentials).toBe('include');
    expect(new Headers(regInit?.headers).get('Content-Type')).toBe('application/json');
    expect(regInit?.body).toBe('{}');
  });

  it('surfaces localized ApiClientError on 409 SETTINGS_CONFLICT and ONELINK_REGISTER_IN_PROGRESS', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'SETTINGS_CONFLICT', message: 'Conflict' } }, 409),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'ONELINK_REGISTER_IN_PROGRESS', message: 'Busy' } }, 409),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adminApi.updateOneLinkSso({ expectedRevision: 1, enabled: true, expectedClientId: null }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'SETTINGS_CONFLICT',
      message: CODE_LABELS.SETTINGS_CONFLICT,
    });

    await expect(adminApi.registerOneLinkSso()).rejects.toMatchObject({
      status: 409,
      code: 'ONELINK_REGISTER_IN_PROGRESS',
      message: CODE_LABELS.ONELINK_REGISTER_IN_PROGRESS,
    });
  });
});

describe('userAuthApi C-end sandbox client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls all C-end me, profile, phone OTP, and OneLink endpoints with credentials: include', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ userId: 'u_1', sessionId: 's_1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          userId: 'u_1',
          displayId: 'M1001',
          name: '测试用户',
          avatarAssetId: null,
          phoneNumber: null,
          phoneNumberVerified: false,
          wechatBound: false,
          onelinkBound: false,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ url: 'https://sso.example.test/authorize?state=abc' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'candidate_ready',
          intent: 'login',
          candidateToken: 'cand_tok_demo',
          onelinkSub: 'ol_sub_demo_001',
          onelinkSubMasked: 'ol_s***001',
          clientId: 'miioo',
          expiresAt: '2026-04-01T10:15:00.000Z',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true, action: 'create', userId: 'u_2' }))
      .mockResolvedValueOnce(jsonResponse({ status: true, action: 'link_existing', userId: 'u_1' }))
      .mockResolvedValueOnce(
        jsonResponse({ status: true, action: 'bind_current', userId: 'u_1', alreadyBound: false }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await userAuthApi.me()).toEqual({ userId: 'u_1', sessionId: 's_1' });
    expect((await userAuthApi.profile()).onelinkBound).toBe(false);
    expect(await userAuthApi.signOut()).toBeUndefined();
    await userAuthApi.sendPhoneLoginOtp('13800138000');
    await userAuthApi.verifyPhoneLogin('13800138000', '123456');
    await userAuthApi.sendPhoneBindingOtp('13900139000');
    await userAuthApi.confirmPhoneBinding('13900139000', '654321');
    expect(await userAuthApi.startOneLink('login', SANDBOX_RETURN_PATH)).toEqual({
      url: 'https://sso.example.test/authorize?state=abc',
    });
    expect((await userAuthApi.getOneLinkPending()).onelinkSub).toBe('ol_sub_demo_001');
    expect(await userAuthApi.cancelOneLinkPending()).toEqual({ ok: true });
    await userAuthApi.sendOneLinkExistingOtp('13800138000');
    await userAuthApi.completeOneLink({ action: 'create', candidateToken: 'cand_tok_demo' });
    await userAuthApi.completeOneLink({
      action: 'link_existing',
      candidateToken: 'cand_tok_demo',
      phoneNumber: '13800138000',
      code: '123456',
    });
    await userAuthApi.completeOneLink({ action: 'bind_current', candidateToken: 'cand_tok_demo' });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/me', 'GET'],
      ['/api/v1/me/profile', 'GET'],
      ['/api/auth/sign-out', 'POST'],
      ['/api/auth/phone-number/send-otp', 'POST'],
      ['/api/auth/phone-number/verify', 'POST'],
      ['/api/auth/phone-binding/send-otp', 'POST'],
      ['/api/auth/phone-binding/confirm', 'POST'],
      ['/api/auth/onelink/start', 'POST'],
      ['/api/auth/onelink/pending', 'GET'],
      ['/api/auth/onelink/cancel', 'POST'],
      ['/api/auth/onelink/existing/send-otp', 'POST'],
      ['/api/auth/onelink/complete', 'POST'],
      ['/api/auth/onelink/complete', 'POST'],
      ['/api/auth/onelink/complete', 'POST'],
    ]);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('include');
    }
    expect(fetchMock.mock.calls[7]?.[1]?.body).toBe(
      JSON.stringify({ intent: 'login', returnPath: '/?nav=onelink-sandbox' }),
    );
    expect(fetchMock.mock.calls[12]?.[1]?.body).toBe(
      JSON.stringify({
        action: 'link_existing',
        candidateToken: 'cand_tok_demo',
        phoneNumber: '13800138000',
        code: '123456',
      }),
    );
  });

  it('normalizes both { error: { code, message } } and flat Better Auth { code, message } envelopes', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'ONELINK_PENDING_NOT_FOUND', message: 'Not found' } }, 404),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 'INVALID_OTP', message: 'Invalid OTP' }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ code: 'CUSTOM_BA_ERROR', message: 'Better Auth custom message' }, 400),
      )
      .mockResolvedValueOnce(jsonResponse({ message: 'Flat message without code' }, 429))
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(userAuthApi.getOneLinkPending()).rejects.toMatchObject({
      status: 404,
      code: 'ONELINK_PENDING_NOT_FOUND',
      message: CODE_LABELS.ONELINK_PENDING_NOT_FOUND,
    });

    await expect(userAuthApi.verifyPhoneLogin('13800138000', '000000')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
      message: CODE_LABELS.INVALID_OTP,
    });

    await expect(userAuthApi.sendPhoneLoginOtp('13800138000')).rejects.toMatchObject({
      status: 400,
      code: 'CUSTOM_BA_ERROR',
      message: 'Better Auth custom message',
    });

    await expect(userAuthApi.sendPhoneBindingOtp('13800138000')).rejects.toMatchObject({
      status: 429,
      code: 'REQUEST_FAILED',
      message: 'Flat message without code',
    });

    const err = await userAuthApi.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      status: 503,
      code: 'REQUEST_FAILED',
      message: '请求失败 (HTTP 503)',
    });
  });
});

describe('vite.config parseAllowedHosts', () => {
  it('preserves default Vite check when unset or blank, supports true, and trims CSV hostnames', () => {
    expect(parseAllowedHosts(undefined)).toBeUndefined();
    expect(parseAllowedHosts('')).toBeUndefined();
    expect(parseAllowedHosts('   ,  , ')).toBeUndefined();
    expect(parseAllowedHosts('true')).toBe(true);
    expect(parseAllowedHosts(' TRUE ')).toBe(true);
    expect(parseAllowedHosts('tunnel.example.test')).toEqual(['tunnel.example.test']);
    expect(parseAllowedHosts(' a.example.test, b.example.test , a.example.test , ')).toEqual([
      'a.example.test',
      'b.example.test',
    ]);
  });
});

describe('OneLinkSsoSettingsCard helpers', () => {
  it('validates expectedClientId and explicitly refuses routerClientId', () => {
    expect(validateExpectedClientId('')).toBeNull();
    expect(validateExpectedClientId('   ')).toBeNull();
    expect(validateExpectedClientId('miiooClientId')).toBeNull();
    expect(validateExpectedClientId('routerClientId')).toContain('routerClientId');
    expect(validateExpectedClientId('  ROUTERCLIENTID  ')).toContain('routerClientId');
    expect(validateExpectedClientId('bad client')).toContain('空白');
    expect(validateExpectedClientId('a'.repeat(129))).toContain('128');
  });

  it('formats badges and all 4 registration outcomes including traceId', () => {
    expect(getRegistrationStatusBadge('unregistered').label).toBe('未注册');
    expect(getRegistrationStatusBadge('registered').label).toBe('已注册');
    expect(getRegistrationStatusBadge('trusted_existing').label).toBe('已确认可信(362)');

    const base = makeSampleSsoView();
    expect(
      formatRegisterOutcomeFeedback({
        ...base,
        config: { ...base.config, clientId: 'miiooClientId' },
        outcome: 'registered',
        upstreamCode: 200,
        errorCode: null,
        traceId: 'trace_200',
      }),
    ).toMatchObject({ tone: 'success', traceId: 'trace_200' });

    expect(
      formatRegisterOutcomeFeedback({
        ...base,
        config: { ...base.config, lastRegisterMessage: 'already_exists_trusted' },
        outcome: 'already_exists_trusted',
        upstreamCode: 362,
        errorCode: null,
        traceId: 'trace_362',
      }),
    ).toMatchObject({
      tone: 'info',
      traceId: 'trace_362',
      detail: expect.stringContaining('万联上游已存在同名客户端'),
    });

    const staleRegisteredConfig = {
      ...base.config,
      revision: 3,
      lastRegisterTraceId: 'trace_old_200',
      lastRegisterMessage: 'registered',
    };

    const rejected = formatRegisterOutcomeFeedback({
      ...base,
      config: staleRegisteredConfig,
      outcome: 'rejected',
      upstreamCode: 364,
      errorCode: 'ONELINK_CLIENT_TEMPLATE_MISSING',
      traceId: null,
    });
    expect(rejected).toMatchObject({ tone: 'warning', traceId: null });
    expect(rejected.title).toContain('364');
    expect(rejected.detail).toContain('模板');
    expect(rejected.detail).not.toContain('registered');

    const failed = formatRegisterOutcomeFeedback({
      ...base,
      config: staleRegisteredConfig,
      outcome: 'failed',
      upstreamCode: 502,
      errorCode: 'ONELINK_REGISTER_UPSTREAM_FAILED',
      traceId: null,
    });
    expect(failed).toMatchObject({ tone: 'error', traceId: null });
    expect(failed.detail).not.toContain('registered');

    expect(
      shouldPreserveDraftAfterRegister(3, {
        ...base,
        config: staleRegisteredConfig,
        outcome: 'failed',
        upstreamCode: 502,
        errorCode: 'ONELINK_REGISTER_UPSTREAM_FAILED',
        traceId: null,
      }),
    ).toBe(true);
    expect(
      shouldPreserveDraftAfterRegister(3, {
        ...base,
        config: staleRegisteredConfig,
        outcome: 'rejected',
        upstreamCode: 363,
        errorCode: 'ONELINK_CLIENT_NAME_INVALID',
        traceId: 'trace_363',
      }),
    ).toBe(true);
    expect(
      shouldPreserveDraftAfterRegister(2, {
        ...base,
        config: staleRegisteredConfig,
        outcome: 'failed',
        upstreamCode: 502,
        errorCode: 'ONELINK_REGISTER_UPSTREAM_FAILED',
        traceId: null,
      }),
    ).toBe(false);
    expect(
      shouldPreserveDraftAfterRegister(3, {
        ...base,
        config: staleRegisteredConfig,
        outcome: 'registered',
        upstreamCode: 200,
        errorCode: null,
        traceId: 'trace_200',
      }),
    ).toBe(false);
  });
});

describe('OneLinkAuthSandboxPage & App routing helpers', () => {
  it('resolves initial nav tab from ?nav= and falls back to sandbox when onelink_result is present', () => {
    expect(resolveInitialNav('?nav=onelink-sandbox&onelink_result=choose_account')).toBe(
      'onelink-sandbox',
    );
    expect(resolveInitialNav('?onelink_result=invalid_state')).toBe('onelink-sandbox');
    expect(resolveInitialNav('?nav=unknown-tab&onelink_result=invalid_state')).toBe(
      'onelink-sandbox',
    );
    expect(resolveInitialNav('?nav=settings')).toBe('settings');
    expect(resolveInitialNav('?nav=unknown-tab')).toBe('catalog');
    expect(resolveInitialNav('')).toBe('catalog');
  });

  it('maps all 8 callback results and cleans onelink_result while preserving nav param', () => {
    const expectedTones = {
      logged_in: 'success',
      choose_account: 'info',
      confirm_bind: 'info',
      unauthorized: 'error',
      invalid_token: 'error',
      invalid_state: 'error',
      session_required: 'warning',
      account_disabled: 'error',
    } as const;

    for (const [result, tone] of Object.entries(expectedTones)) {
      const banner = parseOneLinkCallbackResult(`?nav=onelink-sandbox&onelink_result=${result}`);
      expect(banner).not.toBeNull();
      expect(banner?.result).toBe(result);
      expect(banner?.tone).toBe(tone);
      expect(banner?.title).toContain(result);
    }

    expect(parseOneLinkCallbackResult('?nav=onelink-sandbox')).toBeNull();
    expect(parseOneLinkCallbackResult('?onelink_result=future_status')).toMatchObject({
      result: 'future_status',
      tone: 'warning',
    });

    expect(
      buildCleanedSandboxUrl(
        'https://admin.example.test/?nav=onelink-sandbox&onelink_result=logged_in#top',
      ),
    ).toBe('/?nav=onelink-sandbox#top');
    expect(buildCleanedSandboxUrl('https://admin.example.test/?onelink_result=confirm_bind')).toBe(
      '/?nav=onelink-sandbox',
    );
  });

  it('enforces strict redirect URL validation (HTTPS, loopback HTTP, clean relative paths only)', () => {
    expect(isSafeRedirectUrl('https://sso.example.test/authorize')).toBe(true);
    expect(isSafeRedirectUrl('http://127.0.0.1:4310/authorize')).toBe(true);
    expect(isSafeRedirectUrl('http://localhost:4310/authorize')).toBe(true);
    expect(isSafeRedirectUrl('http://[::1]:4310/authorize')).toBe(true);
    expect(isSafeRedirectUrl('/api/auth/callback/onelink')).toBe(true);

    expect(isSafeRedirectUrl('http://attacker.example.test/phish')).toBe(false);
    expect(isSafeRedirectUrl('/\\attacker.example.test')).toBe(false);
    expect(isSafeRedirectUrl('https://user:pass@sso.example.test/authorize')).toBe(false);
    expect(isSafeRedirectUrl('https://user@sso.example.test/authorize')).toBe(false);
    expect(isSafeRedirectUrl('https://')).toBe(false);
    expect(isSafeRedirectUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectUrl('//evil.example.test')).toBe(false);
    expect(isSafeRedirectUrl('')).toBe(false);
    expect(isSafeRedirectUrl('   ')).toBe(false);
    expect(isSafeRedirectUrl('https://sso.example.test/\u0000bad')).toBe(false);
    expect(isSafeRedirectUrl('https://sso.example.test/authorize\n')).toBe(false);
  });

  it('classifies pending errors and handles refresh states without retaining stale candidates', () => {
    const notFound = classifyPendingError(
      new ApiClientError(404, 'EXISTING_PHONE_NOT_FOUND', CODE_LABELS.EXISTING_PHONE_NOT_FOUND!),
      'fallback',
    );
    expect(notFound.shouldRefresh).toBe(false);
    expect(notFound.feedback.tone).toBe('warning');
    expect(notFound.feedback.hint).toContain('创建新账号');

    const sessionRequired = classifyPendingError(
      new ApiClientError(401, 'SESSION_REQUIRED', CODE_LABELS.SESSION_REQUIRED!),
      'fallback',
    );
    expect(sessionRequired.shouldRefresh).toBe(false);
    expect(sessionRequired.feedback.tone).toBe('warning');
    expect(sessionRequired.feedback.hint).toContain('绑定当前 C 端账号');

    for (const code of ['ONELINK_ALREADY_BOUND', 'PHONE_CONFLICT']) {
      const conflict = classifyPendingError(new ApiClientError(409, code, 'raw'), 'fallback');
      expect(conflict.shouldRefresh).toBe(false);
      expect(conflict.feedback.message).toBe('该登录方式已绑定，暂不能完成本次操作');
    }

    const stale = classifyPendingError(
      new ApiClientError(404, 'ONELINK_PENDING_NOT_FOUND', CODE_LABELS.ONELINK_PENDING_NOT_FOUND!),
      'fallback',
    );
    expect(stale.shouldRefresh).toBe(true);

    expect(
      resolvePendingRefresh({
        status: 'rejected',
        reason: new ApiClientError(404, 'ONELINK_PENDING_NOT_FOUND', 'missing'),
      }),
    ).toEqual({ pending: null, loading: false, error: null });

    expect(
      resolvePendingRefresh({
        status: 'rejected',
        reason: new ApiClientError(404, 'NOT_FOUND', 'Route not found'),
      }),
    ).toEqual({ pending: null, loading: false, error: 'Route not found' });

    expect(
      resolvePendingRefresh({
        status: 'rejected',
        reason: new ApiClientError(401, 'SESSION_REQUIRED', CODE_LABELS.SESSION_REQUIRED!),
      }),
    ).toEqual({ pending: null, loading: false, error: CODE_LABELS.SESSION_REQUIRED });

    expect(
      resolvePendingRefresh({
        status: 'rejected',
        reason: new ApiClientError(503, 'ONELINK_UNAVAILABLE', CODE_LABELS.ONELINK_UNAVAILABLE!),
      }),
    ).toEqual({ pending: null, loading: false, error: CODE_LABELS.ONELINK_UNAVAILABLE });

    expect(
      resolveSessionRefresh(
        {
          status: 'rejected',
          reason: new ApiClientError(401, 'UNAUTHORIZED', CODE_LABELS.UNAUTHORIZED!),
        },
        INIT_SESSION,
      ),
    ).toEqual({ session: null, profile: null, loading: false, error: null });

    expect(
      resolveSessionRefresh(
        {
          status: 'rejected',
          reason: new ApiClientError(503, 'AUTH_UNAVAILABLE', CODE_LABELS.AUTH_UNAVAILABLE!),
        },
        INIT_SESSION,
      ),
    ).toEqual({
      session: null,
      profile: null,
      loading: false,
      error: CODE_LABELS.AUTH_UNAVAILABLE,
    });
  });
});
