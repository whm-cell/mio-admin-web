import {
  AlertCircle,
  BookmarkPlus,
  Check,
  Code2,
  Eye,
  EyeOff,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';
import type { AdminModelItem, Category, RouteTemplateItem } from '../types';

interface RouteEditorDrawerProps {
  model: AdminModelItem | null;
  templates: RouteTemplateItem[];
  drivers: { chat: string[]; image: string[] };
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onTemplateSaved: () => void;
}

function fallbackEmptyRoute(
  rawModelId: string,
  operation: 'image.generate' | 'chat',
  templates: RouteTemplateItem[],
  drivers: { chat: string[]; image: string[] },
): Record<string, unknown> {
  const matchedTpl = templates.find((t) => t.operation === operation);
  if (matchedTpl) {
    return {
      ...structuredClone(matchedTpl.routeTemplate),
      rawModelId,
    };
  }
  if (operation === 'chat') {
    const drv = drivers.chat[0] ?? 'openai-chat';
    return {
      providerType: 'onelink',
      rawModelId,
      operation: 'chat',
      vendor: drv === 'anthropic-messages' ? 'anthropic' : 'openai',
      driver: drv,
      classification: 'chat',
      submitPath: drv === 'anthropic-messages' ? '/v1/messages' : '/v1/chat/completions',
      sourceKind: 'protocol-reference',
      source: 'Admin Console',
      sourceVersion: new Date().toISOString().slice(0, 10),
      enabled: true,
      capabilityMetadata: { maxOutputTokens: 4096, inputModalities: ['text'] },
    };
  }
  const drv = drivers.image[0] ?? 'openai-images';
  return {
    providerType: 'onelink',
    rawModelId,
    operation: 'image.generate',
    vendor: 'openai',
    driver: drv,
    classification: 'image',
    submitPath: '/v1/images/generations',
    sourceKind: 'protocol-reference',
    source: 'Admin Console',
    sourceVersion: new Date().toISOString().slice(0, 10),
    enabled: true,
    paramSpec: {
      supportedOperations: ['generate'],
      requiresAsync: false,
      maxN: 1,
      allowExplicitN: true,
      allowedSizes: null,
      allowCustomDimensions: false,
      maxReferenceImages: 0,
      allowGenerateReferences: false,
      allowMaskPng: false,
      allowOutpaintGeometry: false,
      allowedQualities: [],
      allowedBackgrounds: [],
      allowedModerations: [],
      allowedOutputFormats: [],
      allowOutputCompression: false,
      allowUserField: false,
      allowedAspectRatios: [],
      allowWatermarkOverride: false,
      async: null,
    },
    requestDefaults: {},
    outputSpec: { fixedOutputFormat: null },
  };
}

export function RouteEditorDrawer({
  model,
  templates,
  drivers,
  categories,
  onClose,
  onSaved,
  onTemplateSaved,
}: RouteEditorDrawerProps) {
  const isOpen = Boolean(model);
  const targetModelId = model?.rawModelId ?? '';

  // Model metadata & policy state
  const [userVisible, setUserVisible] = useState(true);
  const [allowUndiscovered, setAllowUndiscovered] = useState(false);
  const [displayLabel, setDisplayLabel] = useState('');
  const [vendorLabel, setVendorLabel] = useState('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [modelNotice, setModelNotice] = useState<string | null>(null);

  // Route editor state
  const [activeOperation, setActiveOperation] = useState<'image.generate' | 'chat'>(
    'image.generate',
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [routeDraft, setRouteDraft] = useState<Record<string, unknown>>({});
  const [jsonText, setJsonText] = useState('');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [customRatioInput, setCustomRatioInput] = useState('');
  const [customFormatInput, setCustomFormatInput] = useState('');

  // Save as template inline dialog
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [newTplKey, setNewTplKey] = useState('');
  const [newTplLabel, setNewTplLabel] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  // Diff & publish confirmation state
  const [showDiffConfirm, setShowDiffConfirm] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;
    setUserVisible(model.policy.userVisible);
    setAllowUndiscovered(model.policy.allowUndiscovered);
    setDisplayLabel(model.displayLabel ?? '');
    setVendorLabel(model.vendorLabel ?? '');
    setCategory(model.category ?? '');
    setDescription(model.description ?? '');
    setCallNotes(model.policy.callNotes ?? '');
    setModelNotice(null);
    setRouteError(null);
    setShowDiffConfirm(false);
    setSaveTplOpen(false);
    setChangeSummary('');

    const preferredOp: 'image.generate' | 'chat' =
      model.imageRoute || model.category === 'image'
        ? 'image.generate'
        : model.chatRoute || model.category === 'chat'
          ? 'chat'
          : 'image.generate';
    setActiveOperation(preferredOp);
    setSelectedTemplateId(null);

    const existing =
      preferredOp === 'image.generate'
        ? (model.imageRoute ??
          fallbackEmptyRoute(model.rawModelId, 'image.generate', templates, drivers))
        : (model.chatRoute ?? fallbackEmptyRoute(model.rawModelId, 'chat', templates, drivers));
    setRouteDraft(structuredClone(existing));
    setJsonText(JSON.stringify(existing, null, 2));
    setJsonParseError(null);
  }, [model, templates, drivers]);

  const switchOperation = (op: 'image.generate' | 'chat') => {
    if (!model) return;
    setActiveOperation(op);
    setSelectedTemplateId(null);
    const existing =
      op === 'image.generate'
        ? (model.imageRoute ??
          fallbackEmptyRoute(model.rawModelId, 'image.generate', templates, drivers))
        : (model.chatRoute ?? fallbackEmptyRoute(model.rawModelId, 'chat', templates, drivers));
    setRouteDraft(structuredClone(existing));
    setJsonText(JSON.stringify(existing, null, 2));
    setJsonParseError(null);
    setShowDiffConfirm(false);
  };

  const syncDraft = (next: Record<string, unknown>) => {
    setRouteDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
    setJsonParseError(null);
  };

  const applyTemplate = (tpl: RouteTemplateItem) => {
    const built = {
      ...structuredClone(tpl.routeTemplate),
      rawModelId: targetModelId,
    };
    setSelectedTemplateId(tpl.id);
    setActiveOperation(tpl.operation);
    syncDraft(built);
  };

  const currentBaselineRoute = useMemo(() => {
    if (!model) return null;
    return activeOperation === 'image.generate' ? model.imageRoute : model.chatRoute;
  }, [model, activeOperation]);

  // Dynamically derive UI quick-pick chips from matching DB templates (zero source hardcoding!)
  const dynamicUiHints = useMemo(() => {
    const activeDriver = String(routeDraft.driver ?? '');
    const selectedTpl = templates.find((t) => t.id === selectedTemplateId);
    const driverTemplates = selectedTpl
      ? [
          selectedTpl,
          ...templates.filter((t) => t.driver === activeDriver && t.id !== selectedTpl.id),
        ]
      : templates.filter((t) => t.driver === activeDriver);
    const sizes = new Set<string>();
    const ratios = new Set<string>();
    const formats = new Set<string>();
    for (const t of driverTemplates) {
      for (const s of t.uiHints.recommendedSizes ?? []) sizes.add(s);
      for (const r of t.uiHints.recommendedAspectRatios ?? []) ratios.add(r);
      for (const f of t.uiHints.recommendedOutputFormats ?? []) formats.add(f);
    }
    return {
      sizes: [...sizes],
      ratios: [...ratios],
      formats: [...formats],
    };
  }, [templates, selectedTemplateId, routeDraft.driver]);

  if (!isOpen || !model) return null;

  const paramSpec = (routeDraft.paramSpec as Record<string, unknown> | undefined) ?? {};
  const requestDefaults = (routeDraft.requestDefaults as Record<string, unknown> | undefined) ?? {};
  const outputSpec = (routeDraft.outputSpec as Record<string, unknown> | undefined) ?? {};
  const capabilityMetadata =
    (routeDraft.capabilityMetadata as Record<string, unknown> | undefined) ?? {};

  const updateParamSpec = (patch: Record<string, unknown>) => {
    syncDraft({ ...routeDraft, paramSpec: { ...paramSpec, ...patch } });
  };

  const updateRequestDefaults = (patch: Record<string, unknown>) => {
    const merged = { ...requestDefaults, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined) delete merged[k];
    }
    syncDraft({ ...routeDraft, requestDefaults: merged });
  };

  const allowedSizes = Array.isArray(paramSpec.allowedSizes)
    ? (paramSpec.allowedSizes as string[])
    : [];
  const allowedAspectRatios = Array.isArray(paramSpec.allowedAspectRatios)
    ? (paramSpec.allowedAspectRatios as string[])
    : [];
  const allowedOutputFormats = Array.isArray(paramSpec.allowedOutputFormats)
    ? (paramSpec.allowedOutputFormats as string[])
    : [];
  const supportedOps = Array.isArray(paramSpec.supportedOperations)
    ? (paramSpec.supportedOperations as string[])
    : ['generate'];
  const asyncSpec =
    (paramSpec.async as {
      operations?: string[];
      maxQueries?: number;
      maxAgeSeconds?: number;
    } | null) ?? null;

  const handleSaveModelMetadata = async () => {
    setSavingModel(true);
    setModelNotice(null);
    setRouteError(null);
    try {
      await adminApi.updateModel({
        rawModelId: targetModelId,
        displayLabel: displayLabel.trim() || null,
        vendorLabel: vendorLabel.trim() || null,
        category: (category as Category) || null,
        description: description.trim() || null,
        userVisible,
        allowUndiscovered,
        callNotes: callNotes.trim() || null,
      });
      setModelNotice('模型基础信息、可见性与调用要求已保存生效');
      onSaved();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '保存模型信息失败');
    } finally {
      setSavingModel(false);
    }
  };

  const handleDeleteCurrentRoute = async () => {
    if (!currentBaselineRoute) return;
    if (
      !window.confirm(
        `确认删除模型 ${targetModelId} 的 ${activeOperation} 平台路由吗？删除后该操作将回到 ADAPTER_PENDING 状态（可从历史版本恢复）。`,
      )
    ) {
      return;
    }
    setDeletingRoute(true);
    setRouteError(null);
    try {
      await adminApi.deleteRoute(
        targetModelId,
        activeOperation,
        `后台手动删除 ${activeOperation} 路由`,
      );
      onSaved();
      onClose();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '删除路由失败');
    } finally {
      setDeletingRoute(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    setSavingTpl(true);
    setRouteError(null);
    try {
      const candidate =
        editorMode === 'json' ? (JSON.parse(jsonText) as Record<string, unknown>) : routeDraft;
      const cloned = { ...structuredClone(candidate) };
      delete cloned.rawModelId;
      await adminApi.createTemplate({
        templateKey: newTplKey.trim(),
        label: newTplLabel.trim(),
        description: `从模型 ${targetModelId} 提取的协议模板`,
        routeTemplate: cloned,
        uiHints: {
          recommendedSizes: allowedSizes,
          recommendedAspectRatios: allowedAspectRatios,
          recommendedOutputFormats: allowedOutputFormats,
        },
      });
      setSaveTplOpen(false);
      setModelNotice(`已将当前路由另存为动态模板「${newTplLabel.trim()}」`);
      onTemplateSaved();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '另存为模板失败');
    } finally {
      setSavingTpl(false);
    }
  };

  const preparePublish = () => {
    setRouteError(null);
    if (editorMode === 'json') {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        parsed.rawModelId = targetModelId;
        setRouteDraft(parsed);
        setJsonParseError(null);
      } catch (err) {
        setJsonParseError(err instanceof Error ? err.message : 'JSON 语法错误');
        return;
      }
    }
    setShowDiffConfirm(true);
  };

  const handleConfirmPublish = async () => {
    setPublishing(true);
    setRouteError(null);
    try {
      const payload = { ...routeDraft, rawModelId: targetModelId };
      await adminApi.publishRoute(payload, changeSummary.trim() || undefined);
      setShowDiffConfirm(false);
      onSaved();
      onClose();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '发布模型路由失败');
    } finally {
      setPublishing(false);
    }
  };

  const toggleStringItem = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const upstreamDescription =
    typeof model.benchmarkMetadata?.description === 'string' && model.benchmarkMetadata.description
      ? model.benchmarkMetadata.description
      : '（上游未提供原始描述，或为管理员手动新建型号）';

  const upstreamOwnedBy =
    typeof model.benchmarkMetadata?.owned_by === 'string'
      ? model.benchmarkMetadata.owned_by
      : (model.vendorLabel ?? '未知 / 手动录入');

  const sizeChips = [...new Set([...dynamicUiHints.sizes, ...allowedSizes])];
  const ratioChips = [...new Set([...dynamicUiHints.ratios, ...allowedAspectRatios])];
  const formatChips = [...new Set([...dynamicUiHints.formats, ...allowedOutputFormats])];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-semibold text-slate-900">
                {targetModelId}
              </span>
              {!userVisible && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                  <EyeOff className="h-3 w-3" /> 对用户隐藏
                </span>
              )}
              {allowUndiscovered && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                  隐藏补录型号
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              编辑平台模型元数据、普通用户白名单可见性，以及套用数据库动态协议模板发布路由
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[310px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-y-auto">
          {/* Left Column: Upstream Info + Dynamic DB Templates */}
          <div className="p-5 bg-slate-50/60 space-y-5 overflow-y-auto">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                上游参考与实测概况
              </h3>
              <div className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">来源类型</span>
                  <span className="font-mono font-medium text-slate-800">{model.originSource}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">归属厂商 (`owned_by`)</span>
                  <span className="font-medium text-slate-800">{upstreamOwnedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">用户目录发现 / 已实测</span>
                  <span className="font-medium text-slate-800">
                    {model.userDiscoveredCount} 人发现 ·{' '}
                    {model.userVerifiedChatCount + model.userVerifiedImageCount} 人实测
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-slate-500 mb-1">上游 `description` 原文：</div>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                    {upstreamDescription}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                数据库动态快捷配置模板 ({templates.length})
              </h3>
              {templates.length === 0 ? (
                <div className="rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-400">
                  暂无快捷模板，可在左侧菜单「快捷配置模板」页新建，或将右侧路由另存为模板。
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className={`w-full text-left rounded-xl border p-3 transition cursor-pointer ${
                        selectedTemplateId === tpl.id
                          ? 'bg-indigo-50 border-indigo-400'
                          : 'bg-white hover:bg-indigo-50/50 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium text-slate-800">{tpl.label}</span>
                        <span className="font-mono text-[10px] text-slate-400">{tpl.driver}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {tpl.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Model Metadata + Route Specification */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {routeError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{routeError}</div>
              </div>
            )}

            {/* Section 1: Model Metadata & Visibility */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    1. 平台模型主表属性与白名单可见性 (`mio_provider_catalog_models`)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    修改模型名称、分类、描述、普通用户可见开关、隐藏型号补录开关及实际调用备注
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingModel}
                  onClick={handleSaveModelMetadata}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium transition cursor-pointer"
                >
                  {savingModel ? '保存中…' : '保存模型属性'}
                </button>
              </div>

              {modelNotice && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> {modelNotice}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50/70">
                  <input
                    type="checkbox"
                    checked={userVisible}
                    onChange={(e) => setUserVisible(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-900 flex items-center gap-1.5">
                      {userVisible ? (
                        <Eye className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-rose-600" />
                      )}
                      向普通 C 端用户开放可见 (`userVisible`)
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      关闭后立即对普通用户隐藏并以 `409 MODEL_HIDDEN` 拦截调用
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50/70">
                  <input
                    type="checkbox"
                    checked={allowUndiscovered}
                    onChange={(e) => setAllowUndiscovered(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-900">
                      未列出隐藏型号补录 (`allowUndiscovered`)
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      开启后，即使上游 `/v1/models` 未列出此 ID，有效 Key 用户也可看见并调用
                    </p>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    展示名称 (`displayLabel`)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={displayLabel}
                    onChange={(e) => setDisplayLabel(e.target.value)}
                    placeholder="如 Seedream 5.0 专业版"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    归属厂商 (`vendorLabel`)
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={vendorLabel}
                    onChange={(e) => setVendorLabel(e.target.value)}
                    placeholder="如 volcengine / openai / kling"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    所属模态 (`category`)
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">未指定</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    平台展示描述 (`description`)
                  </label>
                  <input
                    type="text"
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="覆盖上游默认英文/简略描述（留空回退上游原文）"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    实际调用要求 / 参数组合说明 (`callNotes`)
                  </label>
                  <input
                    type="text"
                    maxLength={2000}
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="例如：参考图数 + 输出张数 <= 15"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Route & Parameter Spec */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    2. 原厂协议路由与调用参数规格 (`mio_provider_model_routes`)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    支持可视化编辑、JSON 编辑、删除当前路由或将当前配置一键另存为动态模板
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                    <button
                      type="button"
                      onClick={() => switchOperation('image.generate')}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        activeOperation === 'image.generate'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      生图 (`image.generate`)
                    </button>
                    <button
                      type="button"
                      onClick={() => switchOperation('chat')}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        activeOperation === 'chat'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      对话 (`chat`)
                    </button>
                  </div>

                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (editorMode === 'json') {
                          try {
                            const parsed = JSON.parse(jsonText) as Record<string, unknown>;
                            setRouteDraft(parsed);
                            setJsonParseError(null);
                          } catch {
                            // Keep visual draft
                          }
                        }
                        setEditorMode('visual');
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                        editorMode === 'visual'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      <Sliders className="h-3.5 w-3.5" /> 表单
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJsonText(JSON.stringify(routeDraft, null, 2));
                        setEditorMode('json');
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                        editorMode === 'json'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5" /> JSON
                    </button>
                  </div>
                </div>
              </div>

              {editorMode === 'json' ? (
                <div className="space-y-2">
                  <textarea
                    rows={20}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      setJsonParseError(null);
                    }}
                    className="w-full font-mono text-xs p-3.5 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 focus:border-indigo-500 outline-none"
                  />
                  {jsonParseError && (
                    <p className="text-xs text-rose-600">JSON 解析失败：{jsonParseError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        原厂标识 (`vendor`)
                      </label>
                      <input
                        type="text"
                        value={String(routeDraft.vendor ?? '')}
                        onChange={(e) => syncDraft({ ...routeDraft, vendor: e.target.value })}
                        placeholder="volcengine / kling / vidu / openai"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        已实现协议驱动 (`driver`)
                      </label>
                      <select
                        value={String(routeDraft.driver ?? '')}
                        onChange={(e) => syncDraft({ ...routeDraft, driver: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                      >
                        {(activeOperation === 'image.generate' ? drivers.image : drivers.chat).map(
                          (drv) => (
                            <option key={drv} value={drv}>
                              {drv}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={routeDraft.enabled !== false}
                          onChange={(e) => syncDraft({ ...routeDraft, enabled: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="font-medium text-slate-800">
                          启用该平台路由 (`enabled`)
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        提交路径 (`submitPath`)
                      </label>
                      <input
                        type="text"
                        value={String(routeDraft.submitPath ?? '')}
                        onChange={(e) => syncDraft({ ...routeDraft, submitPath: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                    {activeOperation === 'image.generate' && (
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          异步查询模板 (`queryPathTemplate`，含 `{'{task_id}'}`)
                        </label>
                        <input
                          type="text"
                          value={String(routeDraft.queryPathTemplate ?? '')}
                          onChange={(e) => {
                            const next = { ...routeDraft };
                            if (e.target.value.trim())
                              next.queryPathTemplate = e.target.value.trim();
                            else delete next.queryPathTemplate;
                            syncDraft(next);
                          }}
                          placeholder="同步模型留空；异步如 /kling/v1/images/generations/{task_id}"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {activeOperation === 'image.generate' ? (
                    <div className="space-y-4 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            最大输出张数 (`maxN`)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={Number(paramSpec.maxN ?? 1)}
                            onChange={(e) => updateParamSpec({ maxN: Number(e.target.value) })}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            最大参考图张数 (`0..16`)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={16}
                            value={Number(paramSpec.maxReferenceImages ?? 0)}
                            onChange={(e) =>
                              updateParamSpec({
                                maxReferenceImages: Number(e.target.value),
                                allowGenerateReferences: Number(e.target.value) > 0,
                              })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            默认尺寸 (`defaultSize`)
                          </label>
                          <input
                            type="text"
                            value={String(requestDefaults.defaultSize ?? '')}
                            onChange={(e) =>
                              updateRequestDefaults({
                                defaultSize: e.target.value.trim() || undefined,
                              })
                            }
                            placeholder="如 2K 或留空"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            固定输出格式 (`fixedOutputFormat`)
                          </label>
                          <input
                            type="text"
                            value={String(outputSpec.fixedOutputFormat ?? '')}
                            onChange={(e) =>
                              syncDraft({
                                ...routeDraft,
                                outputSpec: {
                                  fixedOutputFormat: e.target.value.trim() || null,
                                },
                              })
                            }
                            placeholder="留空不固定，或填 jpeg / png / webp"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(paramSpec.requiresAsync)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              updateParamSpec({
                                requiresAsync: checked,
                                async: checked
                                  ? (asyncSpec ?? {
                                      operations: supportedOps,
                                      maxQueries: 8,
                                      maxAgeSeconds: 600,
                                    })
                                  : null,
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>必传异步模式 (`requiresAsync`)</span>
                        </label>

                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={paramSpec.allowExplicitN !== false}
                            onChange={(e) => updateParamSpec({ allowExplicitN: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>允许调用方显式传 `n` (`allowExplicitN`)</span>
                        </label>

                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(paramSpec.allowWatermarkOverride)}
                            onChange={(e) =>
                              updateParamSpec({ allowWatermarkOverride: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>允许用户水印偏好覆盖</span>
                        </label>
                      </div>

                      {asyncSpec && (
                        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              最大轮询次数 (`async.maxQueries`)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={Number(asyncSpec.maxQueries ?? 8)}
                              onChange={(e) =>
                                updateParamSpec({
                                  async: {
                                    operations: asyncSpec.operations ?? ['generate'],
                                    maxQueries: Number(e.target.value),
                                    maxAgeSeconds: asyncSpec.maxAgeSeconds ?? 600,
                                  },
                                })
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block font-medium text-slate-700 mb-1">
                              最长异步等待秒数 (`async.maxAgeSeconds`)
                            </label>
                            <input
                              type="number"
                              min={10}
                              max={86400}
                              value={Number(asyncSpec.maxAgeSeconds ?? 600)}
                              onChange={(e) =>
                                updateParamSpec({
                                  async: {
                                    operations: asyncSpec.operations ?? ['generate'],
                                    maxQueries: asyncSpec.maxQueries ?? 8,
                                    maxAgeSeconds: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                            />
                          </div>
                        </div>
                      )}

                      {/* Dynamic Allowed Sizes */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-medium text-slate-700">
                            可选尺寸白名单 (`allowedSizes`，选项来自当前数据库协议模板 `uiHints`)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={customSizeInput}
                              onChange={(e) => setCustomSizeInput(e.target.value)}
                              placeholder="新增任意尺寸如 2048x2048"
                              className="px-2 py-1 rounded border border-slate-300 font-mono text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = customSizeInput.trim();
                                if (!v) return;
                                const next = allowedSizes.includes(v)
                                  ? allowedSizes
                                  : [...allowedSizes, v];
                                updateParamSpec({ allowedSizes: next });
                                setCustomSizeInput('');
                              }}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] cursor-pointer"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {sizeChips.length === 0 ? (
                            <span className="text-[11px] text-slate-400">
                              不接收 `size`（可在右上角手动输入添加，或在快捷模板中维护推荐项）
                            </span>
                          ) : (
                            sizeChips.map((sz) => {
                              const active = allowedSizes.includes(sz);
                              return (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => {
                                    const next = toggleStringItem(allowedSizes, sz);
                                    updateParamSpec({
                                      allowedSizes: next.length > 0 ? next : null,
                                    });
                                  }}
                                  className={`px-2.5 py-1 rounded-md font-mono text-[11px] border transition cursor-pointer ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {sz}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Dynamic Allowed Aspect Ratios */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-medium text-slate-700">
                            可选画幅比例 (`allowedAspectRatios`)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={customRatioInput}
                              onChange={(e) => setCustomRatioInput(e.target.value)}
                              placeholder="新增比例如 16:9"
                              className="px-2 py-1 rounded border border-slate-300 font-mono text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = customRatioInput.trim();
                                if (!v) return;
                                updateParamSpec({
                                  allowedAspectRatios: allowedAspectRatios.includes(v)
                                    ? allowedAspectRatios
                                    : [...allowedAspectRatios, v],
                                });
                                setCustomRatioInput('');
                              }}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] cursor-pointer"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ratioChips.length === 0 ? (
                            <span className="text-[11px] text-slate-400">
                              不接收 `aspect_ratio`
                            </span>
                          ) : (
                            ratioChips.map((ratio) => {
                              const active = allowedAspectRatios.includes(ratio);
                              return (
                                <button
                                  key={ratio}
                                  type="button"
                                  onClick={() =>
                                    updateParamSpec({
                                      allowedAspectRatios: toggleStringItem(
                                        allowedAspectRatios,
                                        ratio,
                                      ),
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-md font-mono text-[11px] border transition cursor-pointer ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {ratio}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Dynamic Allowed Output Formats */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-medium text-slate-700">
                            调用方可选输出格式 (`allowedOutputFormats`)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={customFormatInput}
                              onChange={(e) => setCustomFormatInput(e.target.value)}
                              placeholder="如 png / jpeg / webp"
                              className="px-2 py-1 rounded border border-slate-300 font-mono text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = customFormatInput.trim();
                                if (!v) return;
                                updateParamSpec({
                                  allowedOutputFormats: allowedOutputFormats.includes(v)
                                    ? allowedOutputFormats
                                    : [...allowedOutputFormats, v],
                                });
                                setCustomFormatInput('');
                              }}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] cursor-pointer"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {formatChips.length === 0 ? (
                            <span className="text-[11px] text-slate-400">
                              不接收 `output_format`
                            </span>
                          ) : (
                            formatChips.map((fmt) => {
                              const active = allowedOutputFormats.includes(fmt);
                              return (
                                <button
                                  key={fmt}
                                  type="button"
                                  onClick={() =>
                                    updateParamSpec({
                                      allowedOutputFormats: toggleStringItem(
                                        allowedOutputFormats,
                                        fmt,
                                      ),
                                    })
                                  }
                                  className={`px-3 py-1 rounded-md font-mono text-xs border transition cursor-pointer ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {fmt}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            最大输出 Token (`1..65536`)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={65536}
                            value={Number(capabilityMetadata.maxOutputTokens ?? 4096)}
                            onChange={(e) =>
                              syncDraft({
                                ...routeDraft,
                                capabilityMetadata: {
                                  ...capabilityMetadata,
                                  maxOutputTokens: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            上下文窗口 (`contextWindow`，可选)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={
                              capabilityMetadata.contextWindow
                                ? Number(capabilityMetadata.contextWindow)
                                : ''
                            }
                            onChange={(e) => {
                              const next = { ...capabilityMetadata };
                              if (e.target.value) next.contextWindow = Number(e.target.value);
                              else delete next.contextWindow;
                              syncDraft({ ...routeDraft, capabilityMetadata: next });
                            }}
                            placeholder="如 128000"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                        <div className="flex items-end pb-1">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={
                                Array.isArray(capabilityMetadata.inputModalities) &&
                                capabilityMetadata.inputModalities.includes('image')
                              }
                              onChange={(e) =>
                                syncDraft({
                                  ...routeDraft,
                                  capabilityMetadata: {
                                    ...capabilityMetadata,
                                    inputModalities: e.target.checked
                                      ? ['text', 'image']
                                      : ['text'],
                                  },
                                })
                              }
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                            <span>支持视觉图片输入 (`text + image`)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Source Provenance */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        依据类型 (`sourceKind`)
                      </label>
                      <select
                        value={String(routeDraft.sourceKind ?? 'protocol-reference')}
                        onChange={(e) => syncDraft({ ...routeDraft, sourceKind: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="protocol-reference">protocol-reference（协议文档）</option>
                        <option value="runtime-observation">runtime-observation（实测观察）</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        依据来源说明 (`source`)
                      </label>
                      <input
                        type="text"
                        value={String(routeDraft.source ?? '')}
                        onChange={(e) => syncDraft({ ...routeDraft, source: e.target.value })}
                        placeholder="如 OneLink 接入文档或实测批次"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        依据版本 (`sourceVersion`)
                      </label>
                      <input
                        type="text"
                        value={String(routeDraft.sourceVersion ?? '')}
                        onChange={(e) =>
                          syncDraft({ ...routeDraft, sourceVersion: e.target.value })
                        }
                        placeholder="如 2026-11-22"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Save as Template Inline Box */}
              {saveTplOpen && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5 text-xs">
                  <div className="font-semibold text-slate-800">
                    将当前路由配置另存为数据库动态快捷模板
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={newTplKey}
                      onChange={(e) => setNewTplKey(e.target.value)}
                      placeholder="唯一键 templateKey（如 custom-kling-v4）"
                      className="px-3 py-1.5 rounded-lg border border-slate-300 font-mono bg-white"
                    />
                    <input
                      type="text"
                      value={newTplLabel}
                      onChange={(e) => setNewTplLabel(e.target.value)}
                      placeholder="展示标题（如 可灵 v4 高清模板）"
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSaveTplOpen(false)}
                      className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-600 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={savingTpl || !newTplKey.trim() || !newTplLabel.trim()}
                      onClick={handleSaveAsTemplate}
                      className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-40 cursor-pointer"
                    >
                      {savingTpl ? '保存中…' : '确认存入模板表'}
                    </button>
                  </div>
                </div>
              )}

              {/* Pre-publish Diff Confirmation */}
              {showDiffConfirm ? (
                <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-4 space-y-3">
                  <div className="text-xs font-semibold text-indigo-950">
                    确认发布路由变更（发布前差异核对）
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="font-medium text-slate-600 mb-1">当前线上配置：</div>
                      <pre className="p-2.5 rounded-lg bg-white border border-slate-200 max-h-48 overflow-auto text-slate-700">
                        {currentBaselineRoute
                          ? JSON.stringify(currentBaselineRoute, null, 2)
                          : '（尚未配置，本次为首次新建 v1）'}
                      </pre>
                    </div>
                    <div>
                      <div className="font-medium text-indigo-700 mb-1">待发布新配置：</div>
                      <pre className="p-2.5 rounded-lg bg-white border border-indigo-200 max-h-48 overflow-auto text-slate-900">
                        {JSON.stringify({ ...routeDraft, rawModelId: targetModelId }, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="填写本次变更说明（记入变更审计）"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white border border-indigo-300 outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDiffConfirm(false)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 cursor-pointer"
                    >
                      返回继续编辑
                    </button>
                    <button
                      type="button"
                      disabled={publishing}
                      onClick={handleConfirmPublish}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                    >
                      {publishing ? '正在发布…' : '确认发布并写入版本历史'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSaveTplOpen((v) => !v)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" /> 另存为快捷模板
                    </button>
                    {currentBaselineRoute && (
                      <button
                        type="button"
                        disabled={deletingRoute}
                        onClick={handleDeleteCurrentRoute}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> 删除当前路由
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      关闭
                    </button>
                    <button
                      type="button"
                      onClick={preparePublish}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-xs cursor-pointer"
                    >
                      预览差异并发布路由
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
