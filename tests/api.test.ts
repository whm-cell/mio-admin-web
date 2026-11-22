import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, adminApi } from '../src/api';

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
});
