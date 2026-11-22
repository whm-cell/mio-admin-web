import {
  CheckCircle2,
  DownloadCloud,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../api';
import type {
  AdminCatalogSummary,
  AdminModelItem,
  Category,
  DiscoveryCandidateItem,
  ProbeStatus,
  RouteTemplateItem,
} from '../types';
import { RouteEditorDrawer } from './RouteEditorDrawer';

function summarizeImageRoute(route: Record<string, unknown> | null): string {
  if (!route) return '—';
  const ps = (route.paramSpec as Record<string, unknown> | undefined) ?? {};
  const out = (route.outputSpec as Record<string, unknown> | undefined) ?? {};
  const parts: string[] = [];
  parts.push(ps.requiresAsync ? '必传异步' : '同步');
  if (Array.isArray(ps.allowedSizes) && ps.allowedSizes.length > 0) {
    parts.push(`尺寸: ${(ps.allowedSizes as string[]).join('/')}`);
  } else if (Array.isArray(ps.allowedAspectRatios) && ps.allowedAspectRatios.length > 0) {
    parts.push(`比例: ${(ps.allowedAspectRatios as string[]).slice(0, 4).join('/')}…`);
  }
  parts.push(`输出 n≤${Number(ps.maxN ?? 1)}`);
  parts.push(`参考图≤${Number(ps.maxReferenceImages ?? 0)}张`);
  if (out.fixedOutputFormat) {
    parts.push(`固定 ${String(out.fixedOutputFormat).toUpperCase()}`);
  } else if (Array.isArray(ps.allowedOutputFormats) && ps.allowedOutputFormats.length > 0) {
    parts.push(`格式: ${(ps.allowedOutputFormats as string[]).join('/')}`);
  }
  return parts.join(' · ');
}

function summarizeChatRoute(route: Record<string, unknown> | null): string {
  if (!route) return '—';
  const meta = (route.capabilityMetadata as Record<string, unknown> | undefined) ?? {};
  const modalities = Array.isArray(meta.inputModalities)
    ? (meta.inputModalities as string[]).join('+')
    : 'text';
  return `${String(route.driver)} · maxTokens=${Number(meta.maxOutputTokens ?? 1024)} · 输入=${modalities}`;
}

export function ModelCatalogPage() {
  const [summary, setSummary] = useState<AdminCatalogSummary | null>(null);
  const [items, setItems] = useState<AdminModelItem[]>([]);
  const [probe, setProbe] = useState<ProbeStatus | null>(null);
  const [templates, setTemplates] = useState<RouteTemplateItem[]>([]);
  const [drivers, setDrivers] = useState<{ chat: string[]; image: string[] }>({
    chat: [],
    image: [],
  });
  const [categories, setCategories] = useState<Category[]>([
    'chat',
    'image',
    'video',
    'voice',
    'music',
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');

  // Probe key bar
  const [probeApiKey, setProbeApiKey] = useState('');
  const [saveProbeKey, setSaveProbeKey] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeBanner, setProbeBanner] = useState<string | null>(null);

  // Candidate import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [candidates, setCandidates] = useState<DiscoveryCandidateItem[]>([]);
  const [candidateTab, setCandidateTab] = useState<'new' | 'existing' | 'ignored' | 'all'>('new');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [candidateCategoryOverrides, setCandidateCategoryOverrides] = useState<
    Record<string, Category | ''>
  >({});
  const [importingCandidates, setImportingCandidates] = useState(false);

  // Create model modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRawId, setNewRawId] = useState('');
  const [newDisplayLabel, setNewDisplayLabel] = useState('');
  const [newVendorLabel, setNewVendorLabel] = useState('');
  const [newCategory, setNewCategory] = useState<string>('image');
  const [newDescription, setNewDescription] = useState('');
  const [newUserVisible, setNewUserVisible] = useState(true);
  const [newAllowUndiscovered, setNewAllowUndiscovered] = useState(true);
  const [newCallNotes, setNewCallNotes] = useState('');
  const [openDrawerAfterCreate, setOpenDrawerAfterCreate] = useState(true);
  const [creatingModel, setCreatingModel] = useState(false);

  // Delete model modal
  const [deletingTarget, setDeletingTarget] = useState<AdminModelItem | null>(null);
  const [ignoreFutureOnDelete, setIgnoreFutureOnDelete] = useState(true);
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  // Editor drawer & batch JSON modal
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchJsonText, setBatchJsonText] = useState('');
  const [batchSummary, setBatchSummary] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const loadTemplatesOnly = useCallback(async () => {
    try {
      const tplRes = await adminApi.listTemplates();
      setTemplates(tplRes.items);
      setDrivers(tplRes.drivers);
      setCategories(tplRes.categories);
    } catch {
      // Handled in main load
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogRes, probeRes, tplRes] = await Promise.all([
        adminApi.listModels({
          q: keyword.trim() || undefined,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          visibility: visibilityFilter || undefined,
        }),
        adminApi.getProbeStatus(),
        adminApi.listTemplates(),
      ]);
      setSummary(catalogRes.summary);
      setItems(catalogRes.items);
      setProbe(probeRes);
      setTemplates(tplRes.items);
      setDrivers(tplRes.drivers);
      setCategories(tplRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载模型目录失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, categoryFilter, statusFilter, visibilityFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const editingModel = useMemo(
    () => (editingModelId ? (items.find((i) => i.rawModelId === editingModelId) ?? null) : null),
    [items, editingModelId],
  );

  const openCandidatesModalWithList = (list: DiscoveryCandidateItem[]) => {
    setCandidates(list);
    const newOnes = list.filter((c) => c.importState === 'new').map((c) => c.rawModelId);
    setSelectedCandidateIds(new Set(newOnes));
    setCandidateTab(newOnes.length > 0 ? 'new' : 'all');
    setCandidateSearch('');
    setCandidateCategoryOverrides({});
    setImportModalOpen(true);
  };

  const handleProbeDiscover = async (useSaved: boolean) => {
    setProbing(true);
    setProbeBanner(null);
    setError(null);
    try {
      const result = await adminApi.discoverOneLink(
        useSaved
          ? {}
          : {
              apiKey: probeApiKey.trim(),
              saveKey: saveProbeKey,
            },
      );
      if (result.status === 'connected') {
        setProbeBanner(
          `OneLink 探测完成：共发现 ${result.discoveredCount} 个模型（待导入 ${result.newCount} · 已入库 ${result.existingCount} · 已忽略 ${result.ignoredCount}）${
            result.savedKey ? '，探测 Key 已加密保存' : ''
          }`,
        );
        if (!useSaved) setProbeApiKey('');
        await loadData();
        openCandidatesModalWithList(result.candidates);
      } else {
        setError(`OneLink 探测失败：${result.error ?? 'UPSTREAM_ERROR'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '探测请求失败');
    } finally {
      setProbing(false);
    }
  };

  const handleOpenCachedCandidates = async () => {
    setError(null);
    try {
      const res = await adminApi.listDiscoveryCandidates();
      openCandidatesModalWithList(res.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取探测缓存失败');
    }
  };

  const handleImportSelectedCandidates = async () => {
    const chosen = candidates.filter((c) => selectedCandidateIds.has(c.rawModelId));
    if (chosen.length === 0) return;
    setImportingCandidates(true);
    setError(null);
    try {
      const payload = chosen.map((c) => {
        const overrideCat = candidateCategoryOverrides[c.rawModelId];
        return {
          rawModelId: c.rawModelId,
          vendorLabel: c.suggestedVendor,
          category: overrideCat !== undefined ? overrideCat || null : c.suggestedCategory,
          supplierMetadata: c.supplierMetadata,
          userVisible: true,
          allowUndiscovered: false,
        };
      });
      const res = await adminApi.importModels(payload, false);
      setImportModalOpen(false);
      setProbeBanner(
        `已成功导入 ${res.imported} 个模型至平台模型主表（跳过已存在 ${res.skipped} 个）`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量导入模型失败');
    } finally {
      setImportingCandidates(false);
    }
  };

  const handleCreateModelSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedId = newRawId.trim();
    if (!trimmedId) return;
    setCreatingModel(true);
    setError(null);
    try {
      await adminApi.createModel({
        rawModelId: trimmedId,
        displayLabel: newDisplayLabel.trim() || null,
        vendorLabel: newVendorLabel.trim() || null,
        category: (newCategory as Category) || null,
        description: newDescription.trim() || null,
        userVisible: newUserVisible,
        allowUndiscovered: newAllowUndiscovered,
        callNotes: newCallNotes.trim() || null,
      });
      setCreateModalOpen(false);
      setProbeBanner(`已新建平台模型 ${trimmedId}`);
      await loadData();
      if (openDrawerAfterCreate) {
        setEditingModelId(trimmedId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建模型失败');
    } finally {
      setCreatingModel(false);
    }
  };

  const handleConfirmDeleteModel = async () => {
    if (!deletingTarget) return;
    setDeletingSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.deleteModel(
        deletingTarget.rawModelId,
        ignoreFutureOnDelete,
        `Web 后台删除模型 ${deletingTarget.rawModelId}`,
      );
      setDeletingTarget(null);
      setProbeBanner(
        `已从平台模型主表删除 ${res.rawModelId}（同步级联删除 ${res.deletedRoutesCount} 条路由，C 端白名单即时隐藏阻断）`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模型失败');
    } finally {
      setDeletingSubmitting(false);
    }
  };

  const handleClearSavedKey = async () => {
    try {
      await adminApi.clearProbeKey();
      setProbeBanner('已清除服务端保存的加密探测 Key');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除探测 Key 失败');
    }
  };

  const handleQuickToggleVisibility = async (item: AdminModelItem) => {
    try {
      await adminApi.updateModel({
        rawModelId: item.rawModelId,
        userVisible: !item.policy.userVisible,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换可见性失败');
    }
  };

  const handleBatchImport = async () => {
    setBatchSubmitting(true);
    setError(null);
    try {
      const parsed = JSON.parse(batchJsonText) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { routes?: unknown[] }).routes)
          ? (parsed as { routes: unknown[] }).routes
          : [parsed];
      const res = await adminApi.publishBatchRoutes(
        list,
        batchSummary.trim() || 'Web 后台批量导入路由',
      );
      setBatchModalOpen(false);
      setProbeBanner(
        `批量发布完成：新增 ${res.inserted} 条，更新 ${res.updated} 条，未变化 ${res.unchanged} 条`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量导入失败，请核对 JSON 格式与路由字段');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const openExportRoutes = () => {
    const exported = items.flatMap((i) => [
      ...(i.chatRoute ? [i.chatRoute] : []),
      ...(i.imageRoute ? [i.imageRoute] : []),
    ]);
    setBatchJsonText(JSON.stringify(exported, null, 2));
    setBatchSummary('');
    setBatchModalOpen(true);
  };

  const visibleCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    return candidates.filter((c) => {
      if (candidateTab !== 'all' && c.importState !== candidateTab) return false;
      if (q) {
        const desc =
          typeof c.supplierMetadata.description === 'string'
            ? c.supplierMetadata.description.toLowerCase()
            : '';
        if (
          !c.rawModelId.toLowerCase().includes(q) &&
          !desc.includes(q) &&
          !(c.suggestedVendor ?? '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [candidates, candidateTab, candidateSearch]);

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: '平台主表模型总数', value: summary.totalModels, tone: 'text-slate-900' },
            { label: '探测/用户发现命中', value: summary.benchmarkModels, tone: 'text-indigo-700' },
            { label: '已启用路由', value: summary.configuredEnabled, tone: 'text-emerald-700' },
            { label: '待配置路由', value: summary.pendingRoutes, tone: 'text-amber-700' },
            { label: '对用户隐藏屏蔽', value: summary.hiddenFromUsers, tone: 'text-rose-700' },
            { label: '隐藏补录型号', value: summary.curatedUndiscovered, tone: 'text-violet-700' },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-2xs"
            >
              <div className="text-xs text-slate-500">{card.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${card.tone}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* OneLink Load & Import + CRUD Toolbar */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-900">
              OneLink 上游模型加载导入 & 平台白名单总控
            </span>
            {probe?.lastProbedAt && (
              <span className="text-xs text-slate-500">
                最近探测：{new Date(probe.lastProbedAt).toLocaleString('zh-CN')}（
                {probe.lastProbeStatus === 'connected'
                  ? `上游 ${probe.lastProbeCount ?? 0} 个`
                  : `失败: ${probe.lastProbeError}`}
                ）
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {probe?.lastProbeCount ? (
              <button
                type="button"
                onClick={() => void handleOpenCachedCandidates()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-xs font-medium text-indigo-700 cursor-pointer"
              >
                <DownloadCloud className="h-3.5 w-3.5" /> 从探测缓存勾选导入
              </button>
            ) : null}
            <button
              type="button"
              onClick={openExportRoutes}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <FileJson className="h-3.5 w-3.5" /> 批量导入/导出路由
            </button>
            <button
              type="button"
              onClick={() => {
                setNewRawId('');
                setNewDisplayLabel('');
                setNewVendorLabel('');
                setNewDescription('');
                setNewCallNotes('');
                setCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-2xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> 新建平台模型
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          <input
            type="password"
            value={probeApiKey}
            onChange={(e) => setProbeApiKey(e.target.value)}
            placeholder="输入任意 OneLink API Key 加载 `/v1/models` 候选列表并自由勾选导入（未导入模型对普通用户默认隐藏）"
            className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-slate-300 focus:border-indigo-500 outline-none font-mono"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveProbeKey}
              onChange={(e) => setSaveProbeKey(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
            />
            加密保存为常用探测 Key
          </label>
          <button
            type="button"
            disabled={probing || !probeApiKey.trim()}
            onClick={() => void handleProbeDiscover(false)}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium transition cursor-pointer"
          >
            {probing ? '正在请求 OneLink…' : '加载并预览导入'}
          </button>

          {probe?.hasSavedKey && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <button
                type="button"
                disabled={probing}
                onClick={() => void handleProbeDiscover(true)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium cursor-pointer"
                title={`使用已加密保存探测 Key (${probe.maskedHint})`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${probing ? 'animate-spin' : ''}`} />
                用已存 Key 加载 ({probe.maskedHint})
              </button>
              <button
                type="button"
                onClick={handleClearSavedKey}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                title="清除已保存的探测 Key"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {probeBanner && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{probeBanner}</span>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模型 ID、名称、描述、厂商或调用备注…"
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-white rounded-lg border border-slate-200 focus:border-indigo-500 outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white rounded-lg border border-slate-200"
        >
          <option value="">全部模态</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white rounded-lg border border-slate-200"
        >
          <option value="">全部路由状态</option>
          <option value="enabled">已启用路由</option>
          <option value="pending">待配置路由 (ADAPTER_PENDING)</option>
          <option value="disabled">已停用路由</option>
        </select>

        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white rounded-lg border border-slate-200"
        >
          <option value="">全部可见性</option>
          <option value="visible">向普通用户开放可见</option>
          <option value="hidden">已对用户隐藏屏蔽</option>
          <option value="curated">隐藏补录型号</option>
        </select>

        <button
          type="button"
          onClick={() => void loadData()}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Main Platform Model CRUD Table */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">模型 ID / 名称 / 模态</th>
                <th className="py-3 px-4 w-[26%]">展示描述 / OneLink 原文</th>
                <th className="py-3 px-4 w-[28%]">Mio 当前开放参数与调用要求</th>
                <th className="py-3 px-4">白名单状态 / 实测</th>
                <th className="py-3 px-4 text-right">CRUD 操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {loading
                      ? '正在加载平台模型主表…'
                      : '平台模型主表暂无数据。请在上方粘贴 OneLink API Key 点击「加载并预览导入」，或点击「新建平台模型」。'}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const hasEnabled =
                    Boolean(item.chatRouteMeta?.enabled) || Boolean(item.imageRouteMeta?.enabled);
                  const hasAnyRoute = item.chatRouteMeta !== null || item.imageRouteMeta !== null;
                  const effectiveDesc =
                    item.description ??
                    (typeof item.benchmarkMetadata?.description === 'string' &&
                    item.benchmarkMetadata.description
                      ? item.benchmarkMetadata.description
                      : '—');
                  const vendorText =
                    item.vendorLabel ??
                    (typeof item.benchmarkMetadata?.owned_by === 'string'
                      ? item.benchmarkMetadata.owned_by
                      : null);

                  return (
                    <tr
                      key={item.rawModelId}
                      className={`hover:bg-slate-50/80 transition ${
                        !item.policy.userVisible ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono font-semibold text-slate-900 break-all">
                          {item.rawModelId}
                        </div>
                        {item.displayLabel && (
                          <div className="text-[11px] text-indigo-700 mt-0.5">
                            {item.displayLabel}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">
                            {item.category ?? '未分类'}
                          </span>
                          {vendorText && (
                            <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-500 text-[11px]">
                              {vendorText}
                            </span>
                          )}
                          {item.policy.allowUndiscovered && (
                            <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[11px] font-medium">
                              隐藏补录
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-slate-600 leading-relaxed">
                        <div className="line-clamp-3" title={effectiveDesc}>
                          {effectiveDesc}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top space-y-1.5">
                        {hasAnyRoute ? (
                          <>
                            {item.imageRouteMeta && (
                              <div>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium mr-1.5 ${
                                    item.imageRouteMeta.enabled
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  生图 v{item.imageRouteMeta.declarationVersion} ·{' '}
                                  {item.imageRouteMeta.enabled ? '已启用' : '已停用'}
                                </span>
                                <div className="text-slate-700 mt-1 leading-relaxed">
                                  {summarizeImageRoute(item.imageRoute)}
                                </div>
                              </div>
                            )}
                            {item.chatRouteMeta && (
                              <div>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium mr-1.5 ${
                                    item.chatRouteMeta.enabled
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  对话 v{item.chatRouteMeta.declarationVersion} ·{' '}
                                  {item.chatRouteMeta.enabled ? '已启用' : '已停用'}
                                </span>
                                <div className="text-slate-700 mt-1">
                                  {summarizeChatRoute(item.chatRoute)}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-medium">
                            待配置平台路由 (ADAPTER_PENDING)
                          </span>
                        )}

                        {item.policy.callNotes && (
                          <div className="rounded bg-amber-50/80 border border-amber-200/80 px-2 py-1 text-[11px] text-amber-900">
                            调用要求：{item.policy.callNotes}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top space-y-1.5">
                        <button
                          type="button"
                          onClick={() => void handleQuickToggleVisibility(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer ${
                            item.policy.userVisible
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                          }`}
                        >
                          {item.policy.userVisible ? (
                            <>
                              <Eye className="h-3 w-3" /> 白名单可见
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" /> 已隐藏阻断
                            </>
                          )}
                        </button>
                        <div className="text-[11px] text-slate-500">
                          {item.userDiscoveredCount} 账号发现 ·{' '}
                          {item.userVerifiedChatCount + item.userVerifiedImageCount} 账号实测
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingModelId(item.rawModelId)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                              hasEnabled
                                ? 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            {hasAnyRoute ? '编辑' : '配路由'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingTarget(item);
                              setIgnoreFutureOnDelete(true);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition cursor-pointer"
                            title="删除该模型"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: OneLink Candidate Preview & Selective Import */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  勾选导入 OneLink 上游模型至平台模型主表
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  仅被导入主表且开启可见的模型才会向普通 C 端用户开放；未导入模型默认拦截隐藏
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white text-xs">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {[
                  {
                    key: 'new' as const,
                    label: `待导入 (${candidates.filter((c) => c.importState === 'new').length})`,
                  },
                  {
                    key: 'existing' as const,
                    label: `已入库 (${candidates.filter((c) => c.importState === 'existing').length})`,
                  },
                  {
                    key: 'ignored' as const,
                    label: `已忽略 (${candidates.filter((c) => c.importState === 'ignored').length})`,
                  },
                  { key: 'all' as const, label: `全部 (${candidates.length})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setCandidateTab(t.key)}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                      candidateTab === t.key
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="过滤候选模型…"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedCandidateIds);
                    for (const c of visibleCandidates) {
                      if (c.importState !== 'existing') next.add(c.rawModelId);
                    }
                    setSelectedCandidateIds(next);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  全选当前页
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCandidateIds(new Set())}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  清空勾选
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
              {visibleCandidates.length === 0 ? (
                <div className="py-12 text-center text-slate-400">当前分组下无候选模型</div>
              ) : (
                visibleCandidates.map((c) => {
                  const checked = selectedCandidateIds.has(c.rawModelId);
                  const desc =
                    typeof c.supplierMetadata.description === 'string'
                      ? c.supplierMetadata.description
                      : '';
                  const catVal =
                    candidateCategoryOverrides[c.rawModelId] !== undefined
                      ? candidateCategoryOverrides[c.rawModelId]
                      : (c.suggestedCategory ?? '');
                  return (
                    <div
                      key={c.rawModelId}
                      className="px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selectedCandidateIds);
                            if (e.target.checked) next.add(c.rawModelId);
                            else next.delete(c.rawModelId);
                            setSelectedCandidateIds(next);
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-900 truncate">
                              {c.rawModelId}
                            </span>
                            {c.suggestedVendor && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-600">
                                {c.suggestedVendor}
                              </span>
                            )}
                            {c.importState === 'existing' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-[10px] text-emerald-700">
                                已入库
                              </span>
                            )}
                            {c.importState === 'ignored' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] text-amber-800">
                                曾删除忽略
                              </span>
                            )}
                          </div>
                          {desc && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">{desc}</div>
                          )}
                        </div>
                      </label>

                      <select
                        value={catVal}
                        onChange={(e) =>
                          setCandidateCategoryOverrides((prev) => ({
                            ...prev,
                            [c.rawModelId]: e.target.value as Category | '',
                          }))
                        }
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-[11px]"
                      >
                        <option value="">未分类</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-600">
                已勾选 <strong className="text-indigo-700">{selectedCandidateIds.size}</strong>{' '}
                个模型
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 cursor-pointer"
                >
                  稍后处理
                </button>
                <button
                  type="button"
                  disabled={importingCandidates || selectedCandidateIds.size === 0}
                  onClick={() => void handleImportSelectedCandidates()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium cursor-pointer"
                >
                  {importingCandidates
                    ? '正在导入…'
                    : `确认导入已勾选模型 (${selectedCandidateIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Create Platform Model */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <form
            onSubmit={handleCreateModelSubmit}
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">新建平台模型</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  精确模型 ID (`rawModelId`) *
                </label>
                <input
                  type="text"
                  required
                  value={newRawId}
                  onChange={(e) => setNewRawId(e.target.value)}
                  placeholder="如 doubao-seedream-5-0-pro-preview"
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  展示名称 (`displayLabel`)
                </label>
                <input
                  type="text"
                  value={newDisplayLabel}
                  onChange={(e) => setNewDisplayLabel(e.target.value)}
                  placeholder="如 Seedream 5.0 Pro"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  归属厂商 (`vendorLabel`)
                </label>
                <input
                  type="text"
                  value={newVendorLabel}
                  onChange={(e) => setNewVendorLabel(e.target.value)}
                  placeholder="volcengine / openai / kling"
                  className="w-full px-3 py-1.5 font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  模态分类 (`category`)
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">未分类</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  调用备注 (`callNotes`)
                </label>
                <input
                  type="text"
                  value={newCallNotes}
                  onChange={(e) => setNewCallNotes(e.target.value)}
                  placeholder="可选参数组合要求"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  模型描述 (`description`)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="向用户展示的功能简介"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUserVisible}
                  onChange={(e) => setNewUserVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>向普通用户开放白名单可见 (`userVisible`)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAllowUndiscovered}
                  onChange={(e) => setNewAllowUndiscovered(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>作为上游未列出的隐藏补录型号向有效 Key 用户开放 (`allowUndiscovered`)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openDrawerAfterCreate}
                  onChange={(e) => setOpenDrawerAfterCreate(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>创建后立即打开原厂路由参数抽屉</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creatingModel || !newRawId.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium cursor-pointer"
              >
                {creatingModel ? '正在创建…' : '确认创建模型'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Delete Model Confirmation */}
      {deletingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-slate-900">确认删除平台模型</h3>
            <p className="text-slate-600 leading-relaxed">
              即将从平台模型主表中删除{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-900">
                {deletingTarget.rawModelId}
              </code>
              。删除后该模型关联的平台路由将同步归档删除（保留历史版本快照），且普通 C
              端用户将立即无法看见或调用该型号。
            </p>
            <label className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreFutureOnDelete}
                onChange={(e) => setIgnoreFutureOnDelete(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>后续重新加载 OneLink 候选列表时，将该型号标记为「已忽略」且默认不勾选</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingSubmitting}
                onClick={() => void handleConfirmDeleteModel()}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium cursor-pointer"
              >
                {deletingSubmitting ? '正在删除…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Batch Import / Export JSON */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                批量导入 / 导出模型路由 JSON
              </h3>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                关闭
              </button>
            </div>
            <p className="text-xs text-slate-500">
              默认展示当前全部已配置路由的规范化
              JSON，可直接复制备份，或粘贴新路由数组一键校验发布（单批最多 500 条）。
            </p>
            <textarea
              rows={14}
              value={batchJsonText}
              onChange={(e) => setBatchJsonText(e.target.value)}
              className="w-full font-mono text-xs p-3.5 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 outline-none"
            />
            <input
              type="text"
              value={batchSummary}
              onChange={(e) => setBatchSummary(e.target.value)}
              placeholder="批量变更说明（选填）"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={batchSubmitting || !batchJsonText.trim()}
                onClick={() => void handleBatchImport()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                {batchSubmitting ? '校验并导入中…' : '校验并批量发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Route & Model Drawer */}
      <RouteEditorDrawer
        model={editingModel}
        templates={templates}
        drivers={drivers}
        categories={categories}
        onClose={() => setEditingModelId(null)}
        onSaved={() => void loadData()}
        onTemplateSaved={() => void loadTemplatesOnly()}
      />
    </div>
  );
}
