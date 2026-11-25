import {
  Activity,
  AlertTriangle,
  Cpu,
  History,
  Layers,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ServerOff,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError, adminApi } from '../api';
import type {
  ComputeExecutionDetailResponse,
  ComputeHistoryResponse,
  ComputeLimitChangeRecord,
  ComputeSummaryResponse,
  ComputeWorkerExecutionView,
  ComputeWorkerView,
} from '../types';
import { ComputeExecutionsPanel } from './ComputeExecutionsPanel';
import type { ComputeExecutionFilterValues } from './ComputeExecutionsPanel';
import { ComputeHistoryChart } from './ComputeHistoryChart';
import { ComputeLimitsAuditPanel, ComputeLimitsTable } from './ComputeLimitsAuditPanel';
import { ComputeOverviewPanel } from './ComputeOverviewPanel';
import { ComputeWorkerDetailPanel } from './ComputeWorkerDetailPanel';
import { WORKER_STATUS_META, formatComputeClockTime } from './computeFormat';

type ComputeSubTab = 'overview' | 'workers' | 'executions' | 'limits';

const SUB_TABS: { key: ComputeSubTab; label: string; icon: typeof Activity }[] = [
  { key: 'overview', label: '总览', icon: Activity },
  { key: 'workers', label: 'Worker 实例', icon: Cpu },
  { key: 'executions', label: '任务占槽', icon: Layers },
  { key: 'limits', label: '调限审计', icon: History },
];

const POLL_INTERVAL_MS = 5_000;

interface ComputeWorkersPageProps {
  onSessionExpired?: () => void;
}

interface ComputeTopToolbarProps {
  activeTab: ComputeSubTab;
  onSelectTab: (tab: ComputeSubTab) => void;
  autoPolling: boolean;
  onToggleAutoPolling: () => void;
  refreshing: boolean;
  onManualRefresh: () => void;
  lastSyncedAt: number | null;
  unauthorizedMessage: string | null;
  unavailableMessage: string | null;
  syncError: string | null;
}

function ComputeTopToolbar({
  activeTab,
  onSelectTab,
  autoPolling,
  onToggleAutoPolling,
  refreshing,
  onManualRefresh,
  lastSyncedAt,
  unauthorizedMessage,
  unavailableMessage,
  syncError,
}: ComputeTopToolbarProps) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100/80 p-1">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelectTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                active
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 text-slate-600 font-mono">
          <span
            className={`h-2 w-2 rounded-full ${
              unauthorizedMessage || syncError
                ? 'bg-rose-500'
                : unavailableMessage
                  ? 'bg-amber-500'
                  : lastSyncedAt
                    ? 'bg-emerald-500'
                    : 'bg-slate-300'
            }`}
          />
          {lastSyncedAt ? `已同步 ${formatComputeClockTime(lastSyncedAt)}` : '尚未同步'}
        </span>

        <button
          type="button"
          onClick={onToggleAutoPolling}
          disabled={unauthorizedMessage !== null}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer disabled:opacity-40 ${
            autoPolling
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {autoPolling ? (
            <PauseCircle className="h-3.5 w-3.5" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          {autoPolling ? '自动轮询 5s：开' : '自动轮询：已暂停'}
        </button>

        <button
          type="button"
          onClick={onManualRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>
    </div>
  );
}

interface ComputeStatusBannersProps {
  unauthorizedMessage: string | null;
  syncError: string | null;
  unavailableMessage: string | null;
  onRetry: () => void;
  onSessionExpired?: () => void;
}

function ComputeStatusBanners({
  unauthorizedMessage,
  syncError,
  unavailableMessage,
  onRetry,
  onSessionExpired,
}: ComputeStatusBannersProps) {
  return (
    <>
      {unauthorizedMessage && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-rose-800">
            <ShieldAlert className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">管理员会话已过期（401 ADMIN_UNAUTHORIZED）</div>
              <p className="mt-0.5">{unauthorizedMessage}，已暂停自动轮询。</p>
            </div>
          </div>
          {onSessionExpired && (
            <button
              type="button"
              onClick={onSessionExpired}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
            >
              重新登录
            </button>
          )}
        </div>
      )}

      {syncError && !unavailableMessage && !unauthorizedMessage && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>拉取最新数据失败：{syncError}（下方保留上次快照，可手动重试或等待下次轮询）</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 立即重试
          </button>
        </div>
      )}
    </>
  );
}

interface ComputeUnavailableCardProps {
  message: string;
  refreshing: boolean;
  onRetry: () => void;
}

function ComputeUnavailableCard({ message, refreshing, onRetry }: ComputeUnavailableCardProps) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-10 text-center space-y-3 shadow-2xs">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
        <ServerOff className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">计算 Worker 观测未启用或暂不可用</h3>
      <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
        {message}。请检查后端是否已配置{' '}
        <code className="font-mono text-slate-700">MIO_COMPUTE_WORKER_INSTANCE_IDS</code>{' '}
        及对应观测数据库连接；管理后台其他页面不受影响。
      </p>
      <div className="pt-1">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          重新检测
        </button>
      </div>
    </section>
  );
}

interface ComputeWorkersTabProps {
  workers: ComputeWorkerView[];
  selectedInstanceId: string | null;
  selectedWorker: ComputeWorkerView | null;
  workerHistory: ComputeHistoryResponse | null;
  workerLimits: ComputeLimitChangeRecord[];
  loading: boolean;
  onSelectInstance: (instanceId: string) => void;
  onRefresh: () => Promise<void> | void;
  onSelectExecution: (executionId: string) => void;
  onUnauthorized: (message: string) => void;
}

function ComputeWorkersTab({
  workers,
  selectedInstanceId,
  selectedWorker,
  workerHistory,
  workerLimits,
  loading,
  onSelectInstance,
  onRefresh,
  onSelectExecution,
  onUnauthorized,
}: ComputeWorkersTabProps) {
  if (workers.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
        {loading ? '正在加载 Worker 实例列表…' : '当前后端未声明任何计算 Worker 实例。'}
      </div>
    );
  }

  const activeWorker =
    selectedWorker ?? workers.find((w) => w.instanceId === selectedInstanceId) ?? workers[0]!;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700">
            选择 Worker 实例（{workers.length}）
          </h3>
          <span className="text-[11px] text-slate-400">显示：实际占用 / 已生效上限</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {workers.map((item) => {
            const selected = item.instanceId === activeWorker.instanceId;
            const statusMeta = WORKER_STATUS_META[item.status];
            return (
              <button
                key={item.instanceId}
                type="button"
                onClick={() => onSelectInstance(item.instanceId)}
                className={`text-left rounded-xl border px-3.5 py-3 transition cursor-pointer ${
                  selected
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-900 truncate">
                    {item.instanceId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${statusMeta.badgeClass}`}
                  >
                    {statusMeta.label}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>
                    总槽{' '}
                    {item.snapshot
                      ? `${item.snapshot.usage.total}/${item.snapshot.limits.applied.total}`
                      : '—'}
                  </span>
                  <span>待槽 {item.snapshot ? item.snapshot.waiting.total : '—'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <ComputeWorkerDetailPanel
        worker={activeWorker}
        onRefresh={onRefresh}
        onSelectExecution={onSelectExecution}
        onUnauthorized={onUnauthorized}
      />

      <ComputeHistoryChart
        title={`实例 ${activeWorker.instanceId} 近 1 小时并发曲线`}
        history={workerHistory}
        loading={loading}
      />

      <section className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
            实例 {activeWorker.instanceId} 最近调限记录
          </span>
          <span className="text-[11px] text-slate-500">最近 20 条</span>
        </div>
        <ComputeLimitsTable
          changes={workerLimits}
          loading={loading}
          emptyText="该实例尚无调限记录。"
        />
      </section>
    </div>
  );
}

interface ComputeTabFetchResult {
  summary?: ComputeSummaryResponse;
  workers: ComputeWorkerView[];
  overviewHistory?: ComputeHistoryResponse;
  resolvedInstanceId?: string | null;
  selectedWorkerDetail?: ComputeWorkerView | null;
  workerHistory?: ComputeHistoryResponse | null;
  workerLimits?: ComputeLimitChangeRecord[];
  executions?: ComputeWorkerExecutionView[];
  selectedExecution?: ComputeExecutionDetailResponse | null;
  execDetailError?: string | null;
  auditChanges?: ComputeLimitChangeRecord[];
}

async function fetchComputeTabData(
  params: {
    activeTab: ComputeSubTab;
    selectedInstanceId: string | null;
    execFilters: ComputeExecutionFilterValues;
    selectedExecutionId: string | null;
    auditInstanceFilter: string;
  },
  signal: AbortSignal,
): Promise<ComputeTabFetchResult> {
  if (params.activeTab === 'overview') {
    const [summary, workersRes, overviewHistory] = await Promise.all([
      adminApi.getComputeSummary({ signal }),
      adminApi.listComputeWorkers({ limit: 64 }, { signal }),
      adminApi.getComputeHistory({}, { signal }),
    ]);
    return {
      summary,
      workers: workersRes.workers,
      overviewHistory,
      resolvedInstanceId: params.selectedInstanceId ?? workersRes.workers[0]?.instanceId ?? null,
    };
  }

  if (params.activeTab === 'workers') {
    const workersRes = await adminApi.listComputeWorkers({ limit: 64 }, { signal });
    const targetId =
      params.selectedInstanceId &&
      workersRes.workers.some((w) => w.instanceId === params.selectedInstanceId)
        ? params.selectedInstanceId
        : (workersRes.workers[0]?.instanceId ?? null);
    if (!targetId) {
      return {
        workers: workersRes.workers,
        resolvedInstanceId: null,
        selectedWorkerDetail: null,
        workerHistory: null,
        workerLimits: [],
      };
    }
    const [selectedWorkerDetail, workerHistory, limitsRes] = await Promise.all([
      adminApi.getComputeWorker(targetId, { signal }),
      adminApi.getComputeHistory({ instanceId: targetId }, { signal }),
      adminApi.listComputeLimits({ instanceId: targetId, limit: 20 }, { signal }),
    ]);
    return {
      workers: workersRes.workers,
      resolvedInstanceId: targetId,
      selectedWorkerDetail,
      workerHistory,
      workerLimits: limitsRes.changes,
    };
  }

  if (params.activeTab === 'executions') {
    const [workersRes, execRes] = await Promise.all([
      adminApi.listComputeWorkers({ limit: 64 }, { signal }),
      adminApi.listComputeExecutions(
        {
          ...(params.execFilters.instanceId ? { instanceId: params.execFilters.instanceId } : {}),
          ...(params.execFilters.jobId ? { jobId: params.execFilters.jobId } : {}),
          ...(params.execFilters.state ? { state: params.execFilters.state } : {}),
          limit: 50,
        },
        { signal },
      ),
    ]);
    if (!params.selectedExecutionId) {
      return { workers: workersRes.workers, executions: execRes.executions };
    }
    try {
      const selectedExecution = await adminApi.getComputeExecution(params.selectedExecutionId, {
        signal,
      });
      return {
        workers: workersRes.workers,
        executions: execRes.executions,
        selectedExecution,
        execDetailError: null,
      };
    } catch (err) {
      if (signal.aborted) throw err;
      if (
        err instanceof ApiClientError &&
        (err.status === 401 ||
          err.code === 'ADMIN_UNAUTHORIZED' ||
          err.code === 'COMPUTE_OPS_UNAVAILABLE')
      ) {
        throw err;
      }
      return {
        workers: workersRes.workers,
        executions: execRes.executions,
        execDetailError: err instanceof Error ? err.message : '加载执行时间线失败',
      };
    }
  }

  const [workersRes, limitsRes] = await Promise.all([
    adminApi.listComputeWorkers({ limit: 64 }, { signal }),
    adminApi.listComputeLimits(
      {
        ...(params.auditInstanceFilter ? { instanceId: params.auditInstanceFilter } : {}),
        limit: 50,
      },
      { signal },
    ),
  ]);
  return { workers: workersRes.workers, auditChanges: limitsRes.changes };
}

export function ComputeWorkersPage({ onSessionExpired }: ComputeWorkersPageProps) {
  const [activeTab, setActiveTab] = useState<ComputeSubTab>('overview');
  const [autoPolling, setAutoPolling] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ComputeSummaryResponse | null>(null);
  const [workers, setWorkers] = useState<ComputeWorkerView[]>([]);
  const [overviewHistory, setOverviewHistory] = useState<ComputeHistoryResponse | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedWorkerDetail, setSelectedWorkerDetail] = useState<ComputeWorkerView | null>(null);
  const [workerHistory, setWorkerHistory] = useState<ComputeHistoryResponse | null>(null);
  const [workerLimits, setWorkerLimits] = useState<ComputeLimitChangeRecord[]>([]);

  const [execFilters, setExecFilters] = useState<ComputeExecutionFilterValues>({
    instanceId: '',
    jobId: '',
    state: '',
  });
  const [executions, setExecutions] = useState<ComputeWorkerExecutionView[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<ComputeExecutionDetailResponse | null>(
    null,
  );
  const [loadingExecDetail, setLoadingExecDetail] = useState(false);
  const [execDetailError, setExecDetailError] = useState<string | null>(null);

  const [auditInstanceFilter, setAuditInstanceFilter] = useState('');
  const [auditChanges, setAuditChanges] = useState<ComputeLimitChangeRecord[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const instanceIds = useMemo(() => workers.map((w) => w.instanceId), [workers]);

  const handleUnauthorized = useCallback((message: string) => {
    setUnauthorizedMessage(message);
    setAutoPolling(false);
    setSyncError(null);
  }, []);

  const loadCurrentView = useCallback(
    async (silent = false) => {
      if (silent && inFlightRef.current) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      const signal = controller.signal;

      if (!silent) setRefreshing(true);
      if (activeTab === 'executions' && selectedExecutionId) setLoadingExecDetail(true);

      try {
        const result = await fetchComputeTabData(
          { activeTab, selectedInstanceId, execFilters, selectedExecutionId, auditInstanceFilter },
          signal,
        );
        if (signal.aborted) return;

        setWorkers(result.workers);
        if (result.summary !== undefined) setSummary(result.summary);
        if (result.overviewHistory !== undefined) setOverviewHistory(result.overviewHistory);
        if (
          result.resolvedInstanceId !== undefined &&
          result.resolvedInstanceId !== selectedInstanceId
        ) {
          setSelectedInstanceId(result.resolvedInstanceId);
        }
        if (result.selectedWorkerDetail !== undefined)
          setSelectedWorkerDetail(result.selectedWorkerDetail);
        if (result.workerHistory !== undefined) setWorkerHistory(result.workerHistory);
        if (result.workerLimits !== undefined) setWorkerLimits(result.workerLimits);
        if (result.executions !== undefined) setExecutions(result.executions);
        if (result.selectedExecution !== undefined) setSelectedExecution(result.selectedExecution);
        if (result.execDetailError !== undefined) setExecDetailError(result.execDetailError);
        if (result.auditChanges !== undefined) setAuditChanges(result.auditChanges);

        setUnavailableMessage(null);
        setUnauthorizedMessage(null);
        setSyncError(null);
        setLastSyncedAt(Date.now());
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof ApiClientError && err.code === 'COMPUTE_OPS_UNAVAILABLE') {
          setUnavailableMessage(err.message);
          setSyncError(null);
        } else if (
          err instanceof ApiClientError &&
          (err.status === 401 || err.code === 'ADMIN_UNAUTHORIZED')
        ) {
          handleUnauthorized(err.message);
        } else {
          setSyncError(err instanceof Error ? err.message : '拉取计算 Worker 观测数据失败');
        }
      } finally {
        if (abortRef.current === controller) inFlightRef.current = false;
        if (!signal.aborted) {
          setRefreshing(false);
          setLoadingExecDetail(false);
        }
      }
    },
    [
      activeTab,
      auditInstanceFilter,
      execFilters,
      handleUnauthorized,
      selectedExecutionId,
      selectedInstanceId,
    ],
  );

  useEffect(() => {
    void loadCurrentView(false);
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [loadCurrentView]);

  useEffect(() => {
    if (!autoPolling || unauthorizedMessage !== null) return;
    const timer = window.setInterval(() => {
      void loadCurrentView(true);
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoPolling, loadCurrentView, unauthorizedMessage]);

  const handleOpenWorker = useCallback(
    (instanceId: string) => {
      if (instanceId !== selectedInstanceId) {
        setSelectedInstanceId(instanceId);
        setSelectedWorkerDetail(null);
        setWorkerHistory(null);
        setWorkerLimits([]);
      }
      setActiveTab('workers');
    },
    [selectedInstanceId],
  );

  const handleSelectExecution = useCallback((executionId: string | null) => {
    setSelectedExecutionId(executionId);
    setSelectedExecution(null);
    setExecDetailError(null);
  }, []);

  const handleOpenExecution = useCallback(
    (executionId: string) => {
      handleSelectExecution(executionId);
      setActiveTab('executions');
    },
    [handleSelectExecution],
  );

  return (
    <div className="space-y-5">
      <ComputeTopToolbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        autoPolling={autoPolling}
        onToggleAutoPolling={() => setAutoPolling((prev) => !prev)}
        refreshing={refreshing}
        onManualRefresh={() => void loadCurrentView(false)}
        lastSyncedAt={lastSyncedAt}
        unauthorizedMessage={unauthorizedMessage}
        unavailableMessage={unavailableMessage}
        syncError={syncError}
      />

      <ComputeStatusBanners
        unauthorizedMessage={unauthorizedMessage}
        syncError={syncError}
        unavailableMessage={unavailableMessage}
        onRetry={() => void loadCurrentView(false)}
        onSessionExpired={onSessionExpired}
      />

      {unavailableMessage ? (
        <ComputeUnavailableCard
          message={unavailableMessage}
          refreshing={refreshing}
          onRetry={() => void loadCurrentView(false)}
        />
      ) : (
        <>
          {activeTab === 'overview' && (
            <ComputeOverviewPanel
              summary={summary}
              workers={workers}
              history={overviewHistory}
              loading={refreshing}
              onOpenWorker={handleOpenWorker}
            />
          )}

          {activeTab === 'workers' && (
            <ComputeWorkersTab
              workers={workers}
              selectedInstanceId={selectedInstanceId}
              selectedWorker={selectedWorkerDetail}
              workerHistory={workerHistory}
              workerLimits={workerLimits}
              loading={refreshing}
              onSelectInstance={handleOpenWorker}
              onRefresh={() => loadCurrentView(false)}
              onSelectExecution={handleOpenExecution}
              onUnauthorized={handleUnauthorized}
            />
          )}

          {activeTab === 'executions' && (
            <ComputeExecutionsPanel
              instances={instanceIds}
              executions={executions}
              loading={refreshing}
              filters={execFilters}
              onApplyFilters={setExecFilters}
              selectedExecutionId={selectedExecutionId}
              selectedExecution={selectedExecution}
              loadingDetail={loadingExecDetail}
              detailError={execDetailError}
              onSelectExecution={handleSelectExecution}
              onSelectWorker={handleOpenWorker}
            />
          )}

          {activeTab === 'limits' && (
            <ComputeLimitsAuditPanel
              instanceIds={instanceIds}
              filterInstanceId={auditInstanceFilter}
              onFilterChange={setAuditInstanceFilter}
              changes={auditChanges}
              loading={refreshing}
              onOpenWorker={handleOpenWorker}
            />
          )}
        </>
      )}
    </div>
  );
}
