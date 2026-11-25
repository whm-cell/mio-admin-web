import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, adminApi } from '../src/api';
import type { GlobalSettingsResponse, UpdateGlobalSettingsInput } from '../src/types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('adminApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends credentials: include and sets Content-Type: application/json when body is present', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          admin: {
            id: 'a1',
            username: 'miioo_admin',
            isSuperAdmin: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          admin: {
            id: 'a1',
            username: 'miioo_admin',
            isSuperAdmin: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const meRes = await adminApi.me();
    expect(meRes.admin.username).toBe('miioo_admin');

    const [meUrl, meInit] = fetchMock.mock.calls[0]!;
    expect(meUrl).toBe('/api/v1/admin/auth/me');
    expect(meInit?.credentials).toBe('include');
    expect(new Headers(meInit?.headers).has('Content-Type')).toBe(false);

    await adminApi.login('miioo_admin', 'password123');
    const [loginUrl, loginInit] = fetchMock.mock.calls[1]!;
    expect(loginUrl).toBe('/api/v1/admin/auth/login');
    expect(loginInit?.method).toBe('POST');
    expect(loginInit?.credentials).toBe('include');
    expect(new Headers(loginInit?.headers).get('Content-Type')).toBe('application/json');
    expect(loginInit?.body).toBe(
      JSON.stringify({ username: 'miioo_admin', password: 'password123' }),
    );
  });

  it('maps known API error codes to localized ApiClientError messages', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'ADMIN_PASSWORD_MISMATCH', message: 'Wrong password' } },
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'ORIGIN_DENIED', message: 'Origin blocked' } }, 403),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'UNMAPPED_SERVER_CODE', message: 'Backend detail message' } },
          422,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      adminApi.updateAccount({ currentPassword: 'old', newPassword: 'new-password' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'ADMIN_PASSWORD_MISMATCH',
      message: '当前原始密码不正确',
    });

    const originErr = await adminApi.logout().catch((e: unknown) => e);
    expect(originErr).toBeInstanceOf(ApiClientError);
    expect(originErr).toMatchObject({
      status: 403,
      code: 'ORIGIN_DENIED',
    });
    expect((originErr as ApiClientError).message).toContain('MIO_ADMIN_ALLOWED_ORIGINS');

    await expect(adminApi.listTemplates()).rejects.toMatchObject({
      status: 422,
      code: 'UNMAPPED_SERVER_CODE',
      message: 'Backend detail message',
    });
  });

  it('falls back to HTTP status error when response body is non-JSON or missing error.code', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ unexpected: true }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adminApi.getProbeStatus()).rejects.toMatchObject({
      status: 502,
      code: 'REQUEST_FAILED',
      message: '请求失败 (HTTP 502)',
    });

    await expect(adminApi.getProbeStatus()).rejects.toMatchObject({
      status: 500,
      code: 'REQUEST_FAILED',
      message: '请求失败 (HTTP 500)',
    });
  });

  it('builds query strings accurately in listModels and listRevisions', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({
        summary: {
          totalModels: 0,
          benchmarkModels: 0,
          configuredEnabled: 0,
          configuredDisabled: 0,
          pendingRoutes: 0,
          hiddenFromUsers: 0,
          curatedUndiscovered: 0,
        },
        items: [],
        routeRevisions: [],
        auditLogs: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await adminApi.listModels();
    await adminApi.listModels({
      q: 'seedream 4',
      category: 'image',
      status: '',
      visibility: 'visible',
    });
    await adminApi.listRevisions();
    await adminApi.listRevisions('vendor/model-x', 20);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/models');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/v1/admin/models?q=seedream+4&category=image&visibility=visible',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/admin/revisions?limit=50');
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/v1/admin/revisions?limit=20&rawModelId=vendor%2Fmodel-x',
    );
  });

  it('calls GET and PATCH /api/v1/admin/settings/global with typed payloads', async () => {
    const initialResponse: GlobalSettingsResponse = {
      settings: {
        auth: {
          emailPasswordEnabled: true,
          smsMode: 'live',
          smsBypassCode: null,
        },
        revision: 0,
        updatedBy: null,
        updatedAt: null,
      },
      runtime: {
        envEmailPasswordDefault: true,
        smsProviderConfigured: true,
      },
    };
    const updatePayload: UpdateGlobalSettingsInput = {
      expectedRevision: 0,
      auth: {
        emailPasswordEnabled: false,
        smsMode: 'bypass',
        smsBypassCode: '888888',
      },
    };
    const updatedResponse: GlobalSettingsResponse = {
      settings: {
        auth: updatePayload.auth,
        revision: 1,
        updatedBy: 'miioo_admin',
        updatedAt: '2026-04-01T12:00:00.000Z',
      },
      runtime: {
        envEmailPasswordDefault: true,
        smsProviderConfigured: true,
      },
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(initialResponse))
      .mockResolvedValueOnce(jsonResponse(updatedResponse));
    vi.stubGlobal('fetch', fetchMock);

    const fetched = await adminApi.getGlobalSettings();
    expect(fetched).toEqual(initialResponse);

    const [getUrl, getInit] = fetchMock.mock.calls[0]!;
    expect(getUrl).toBe('/api/v1/admin/settings/global');
    expect(getInit?.method).toBeUndefined();
    expect(getInit?.credentials).toBe('include');
    expect(new Headers(getInit?.headers).has('Content-Type')).toBe(false);

    const updated = await adminApi.updateGlobalSettings(updatePayload);
    expect(updated).toEqual(updatedResponse);

    const [patchUrl, patchInit] = fetchMock.mock.calls[1]!;
    expect(patchUrl).toBe('/api/v1/admin/settings/global');
    expect(patchInit?.method).toBe('PATCH');
    expect(patchInit?.credentials).toBe('include');
    expect(new Headers(patchInit?.headers).get('Content-Type')).toBe('application/json');
    expect(patchInit?.body).toBe(JSON.stringify(updatePayload));
  });

  it('maps 409 SETTINGS_CONFLICT to localized ApiClientError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'SETTINGS_CONFLICT',
            message: 'Settings revision conflict',
          },
        },
        409,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await adminApi
      .updateGlobalSettings({
        expectedRevision: 2,
        auth: {
          emailPasswordEnabled: true,
          smsMode: 'disabled',
          smsBypassCode: null,
        },
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      status: 409,
      code: 'SETTINGS_CONFLICT',
      message: '全局配置已被其他操作更新，请刷新最新配置后再保存',
    });
  });

  it('calls compute worker observability and dynamic limit endpoints with accurate paths and payloads', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          now: '2026-04-01T00:00:00.000Z',
          instances: { online: 1, stale: 0, offline: 0, unseen: 0 },
          aggregate: {
            usage: { total: 1, encode: 1, probe: 0 },
            applied: { total: 2, encode: 1, probe: 1 },
            hard: { total: 4, encode: 2, probe: 2 },
            waiting: { total: 0, encode: 0, probe: 0 },
            heldResources: 0,
          },
          outbox: { transcode: 0, media: 0, total: 0 },
          broker: { ready: null, unacknowledged: null },
          peaks: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ workers: [], total: 0, offset: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({
          instanceId: 'worker-a.1',
          status: 'unseen',
          bootId: null,
          observedAt: null,
          receivedAt: null,
          ageMs: null,
          clockUncertain: false,
          gap: null,
          draining: false,
          snapshot: null,
          desired: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ executions: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          executionId: '550e8400-e29b-41d4-a716-446655440001',
          instanceId: 'worker-a.1',
          bootId: '550e8400-e29b-41d4-a716-446655440009',
          protocol: 'media',
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          attemptId: '550e8400-e29b-41d4-a716-446655440002',
          inspectionId: null,
          resource: 'encode',
          slots: 1,
          state: 'active',
          uncertain: false,
          queuedAt: null,
          acquiredAt: '2026-04-01T00:00:00.000Z',
          endedAt: null,
          lastAt: '2026-04-01T00:00:02.000Z',
          businessState: 'running',
          businessStage: 'encode',
          timeline: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          since: '2026-04-01T00:00:00.000Z',
          until: '2026-04-01T01:00:00.000Z',
          points: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ changes: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            commandId: '550e8400-e29b-41d4-a716-446655440099',
            revision: 3,
            requestedAt: '2026-04-01T00:00:05.000Z',
            limits: { total: 0, encode: 0, probe: 0 },
            status: 'pending',
          },
          202,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await adminApi.getComputeSummary();
    await adminApi.listComputeWorkers({ limit: 32, offset: 0 });
    await adminApi.getComputeWorker('worker-a.1');
    await adminApi.listComputeExecutions({
      instanceId: 'worker-a.1',
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      state: 'active',
      limit: 25,
    });
    await adminApi.getComputeExecution('550e8400-e29b-41d4-a716-446655440001');
    await adminApi.getComputeHistory({
      instanceId: 'worker-a.1',
      since: '2026-04-01T00:00:00.000Z',
      until: '2026-04-01T01:00:00.000Z',
      limit: 120,
    });
    await adminApi.listComputeLimits({ instanceId: 'worker-a.1', limit: 20 });
    const putRes = await adminApi.updateComputeWorkerLimits('worker-a.1', {
      expectedRevision: 2,
      total: 0,
      encode: 0,
      probe: 0,
    });

    expect(putRes.status).toBe('pending');
    expect(putRes.revision).toBe(3);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/compute/summary');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/admin/compute/workers?limit=32&offset=0');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/admin/compute/workers/worker-a.1');
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/v1/admin/compute/executions?instanceId=worker-a.1&jobId=550e8400-e29b-41d4-a716-446655440000&state=active&limit=25',
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      '/api/v1/admin/compute/executions/550e8400-e29b-41d4-a716-446655440001',
    );
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      '/api/v1/admin/compute/history?instanceId=worker-a.1&since=2026-04-01T00%3A00%3A00.000Z&until=2026-04-01T01%3A00%3A00.000Z&limit=120',
    );
    expect(fetchMock.mock.calls[6]?.[0]).toBe(
      '/api/v1/admin/compute/limits?instanceId=worker-a.1&limit=20',
    );
    const [putUrl, putInit] = fetchMock.mock.calls[7]!;
    expect(putUrl).toBe('/api/v1/admin/compute/workers/worker-a.1/limits');
    expect(putInit?.method).toBe('PUT');
    expect(putInit?.credentials).toBe('include');
    expect(new Headers(putInit?.headers).get('Content-Type')).toBe('application/json');
    expect(putInit?.body).toBe(
      JSON.stringify({ expectedRevision: 2, total: 0, encode: 0, probe: 0 }),
    );
  });

  it('maps compute worker error codes including 503 COMPUTE_OPS_UNAVAILABLE and 409 WORKER_REVISION_CONFLICT', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'COMPUTE_OPS_UNAVAILABLE', message: 'Unavailable' } }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'WORKER_REVISION_CONFLICT', message: 'Conflict' } }, 409),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(adminApi.getComputeSummary()).rejects.toMatchObject({
      status: 503,
      code: 'COMPUTE_OPS_UNAVAILABLE',
      message: '后端未启用计算 Worker 观测或计算观测服务暂不可用',
    });

    await expect(
      adminApi.updateComputeWorkerLimits('worker-a', {
        expectedRevision: 1,
        total: 2,
        encode: 1,
        probe: 1,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'WORKER_REVISION_CONFLICT',
      message: '其他操作员已更新该实例的配置修订，请刷新最新配置后重填',
    });
  });
});
