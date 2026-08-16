import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture, Copy, Download, FileMusic, FileX, FolderOpen, ImagePlus,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Maximize2, Music2, Pause, Play, Settings, SlidersHorizontal,
  Sparkles, Trash2, Upload, Volume2, VolumeX, X, BarChart3, ClipboardPaste
} from 'lucide-react';
import type { Shot, ShotGroup, ShotSize, SplitLayout } from './domain';
import { buildImagePrompt, occurrenceLabel, SHOT_SIZES } from './domain';
import { ScoreCanvas, type PlaybackPosition, type ScoreCanvasHandle } from './score/ScoreCanvas';
import type { ScoreSectionMarker } from './score/navigation';
import { TrackLevelBus, isTrackAudible } from './score/trackLevels';
import { TrackLevelMeter } from './score/TrackLevelMeter';
import { availableLayouts, sortShotGroupsForStoryboard, useWorkspace, type AppSettings, type ApplyShotScope } from './store/workspace';
import { SplitPreview } from './components/SplitPreview';
import { createProjectAutosave, exportProjectPackage, importProjectPackage, ProjectRepository } from './data';
import type { BinaryAsset } from './domain';
import { resolveWorkspaceShortcut } from './keyboard';
import { buildPartStatistics } from './statistics';
import { activeStoryboardTarget, storyboardSeekMeasure, timelineScrollBehavior } from './timelineFollow';

type Health = { museScore?: { available: boolean; version: string | null } };

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function layoutLabel(layout: SplitLayout) {
  if (layout.kind === 'single') return '单画面';
  if (layout.kind === 'horizontal') return `${layout.cells} 分 · 横`;
  if (layout.kind === 'vertical') return `${layout.cells} 分 · 纵`;
  return `${layout.columns * layout.rows} 分 · 宫格`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',');
  const mimeType = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const scoreRef = useRef<ScoreCanvasHandle>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef(new ProjectRepository());
  const autosaveRef = useRef(createProjectAutosave(repositoryRef.current));
  const storyCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const [levelBus] = useState(() => new TrackLevelBus());
  const project = useWorkspace((s) => s.project);
  const parts = useWorkspace((s) => s.parts);
  const selection = useWorkspace((s) => s.selection);
  const selectedGroupId = useWorkspace((s) => s.selectedGroupId);
  const settingsValue = useWorkspace((s) => s.settings);
  const assetUrls = useWorkspace((s) => s.assetUrls);
  const setParts = useWorkspace((s) => s.setParts);
  const setSelection = useWorkspace((s) => s.setSelection);
  const addGroup = useWorkspace((s) => s.addGroup);
  const selectGroup = useWorkspace((s) => s.selectGroup);
  const renameProject = useWorkspace((s) => s.renameProject);
  const updateShot = useWorkspace((s) => s.updateShot);
  const applyShotToSameType = useWorkspace((s) => s.applyShotToSameType);
  const updateLayout = useWorkspace((s) => s.updateLayout);
  const updateRangeOccurrence = useWorkspace((s) => s.updateRangeOccurrence);
  const swapGroupSlots = useWorkspace((s) => s.swapGroupSlots);
  const duplicateGroupShot = useWorkspace((s) => s.duplicateGroupShot);
  const deleteGroup = useWorkspace((s) => s.deleteGroup);
  const setScore = useWorkspace((s) => s.setScore);
  const setSettings = useWorkspace((s) => s.setSettings);
  const setAssetUrl = useWorkspace((s) => s.setAssetUrl);
  const replaceProject = useWorkspace((s) => s.replaceProject);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);

  const [scoreData, setScoreData] = useState<Uint8Array>();
  const [originalScore, setOriginalScore] = useState<Uint8Array>();
  const [scoreFilename, setScoreFilename] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'musicxml' | 'mscz'>('musicxml');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<PlaybackPosition>({ currentTime: 0, endTime: 0, currentTick: 0, endTick: 0, measure: 1, occurrence: 1 });
  const [sections, setSections] = useState<ScoreSectionMarker[]>([]);
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [soloed, setSoloed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(0.82);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(settingsValue);
  const [health, setHealth] = useState<Health>();
  const [notice, setNotice] = useState('导入 MusicXML 或 MSCZ 开始编排');
  const [busy, setBusy] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [collapsedPanels, setCollapsedPanels] = useState({ inspector: false, mixer: false, storyboard: false });
  const togglePanel = (panel: keyof typeof collapsedPanels) => setCollapsedPanels((value) => ({ ...value, [panel]: !value[panel] }));

  const selectedGroup = project.shotGroups.find((group) => group.id === selectedGroupId);
  const storyboardGroups = useMemo(() => sortShotGroupsForStoryboard(project.shotGroups), [project.shotGroups]);
  const activeGroups = useMemo(() => project.shotGroups.filter((group) =>
    position.measure >= group.range.startMeasure && position.measure <= group.range.endMeasure &&
    (group.range.occurrence === 'all' || group.range.occurrence === position.occurrence)
  ), [position.measure, position.occurrence, project.shotGroups]);
  const partStatistics = useMemo(() => buildPartStatistics(project, parts), [parts, project]);
  const activeShotCells = useMemo(() => activeGroups.flatMap((group) => group.shots.map((shot) => ({ partId: shot.partId, startMeasure: group.range.startMeasure, endMeasure: group.range.endMeasure }))), [activeGroups]);

  useEffect(() => {
    if (!playing || !settingsValue.timelineFollow || collapsedPanels.storyboard) return;
    const targetId = activeStoryboardTarget(storyboardGroups, position.measure, position.occurrence);
    const target = targetId ? storyCardRefs.current.get(targetId) : undefined;
    target?.scrollIntoView({
      behavior: timelineScrollBehavior(window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      block: 'nearest',
      inline: 'center',
    });
  }, [collapsedPanels.storyboard, playing, position.measure, position.occurrence, settingsValue.timelineFollow, storyboardGroups]);

  const chooseStoryboardGroup = (group: ShotGroup) => {
    selectGroup(group.id);
    if (!settingsValue.timelineFollow) return;
    scoreRef.current?.seekMeasure(storyboardSeekMeasure(group));
  };

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(undefined));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void repositoryRef.current.list().then(async (items) => {
      if (cancelled || !items[0]) return;
      const saved = await repositoryRef.current.load(items[0].id);
      if (!saved || cancelled) return;
      replaceProject(saved.project);
      const musicXml = saved.assets.find((asset) => asset.kind === 'score-musicxml');
      const original = saved.assets.find((asset) => asset.kind === 'score-original');
      if (musicXml) {
        setScoreFilename(saved.project.score?.name ?? '已恢复乐谱.musicxml');
        const restoredFormat = saved.project.score?.sourceFormat ?? 'musicxml';
        setSourceFormat(restoredFormat);
        setScoreData(new Uint8Array(await musicXml.blob.arrayBuffer()));
        setOriginalScore(restoredFormat === 'mscz' && original ? new Uint8Array(await original.blob.arrayBuffer()) : undefined);
      }
      for (const asset of saved.assets.filter((item) => item.kind.endsWith('image'))) {
        setAssetUrl(asset.id, URL.createObjectURL(asset.blob));
      }
      setNotice(`已恢复项目「${saved.project.name}」`);
    });
    return () => { cancelled = true; };
  }, [replaceProject, setAssetUrl]);

  useEffect(() => {
    autosaveRef.current.schedule(project);
  }, [project]);

  useEffect(() => () => { void autosaveRef.current.dispose(); }, []);
  useEffect(() => () => levelBus.destroy(), [levelBus]);

  const persistAssetUrl = useCallback(async (assetId: string, dataUrl: string, kind: BinaryAsset['kind'], filename: string) => {
    setAssetUrl(assetId, dataUrl);
    const blob = dataUrlToBlob(dataUrl);
    await repositoryRef.current.putAsset({ id: assetId, projectId: project.id, kind, filename, mimeType: blob.type, blob });
  }, [project.id, setAssetUrl]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const command = resolveWorkspaceShortcut(event);
      if (command === 'clear-selection') {
        event.preventDefault();
        setSelection(undefined);
        setNotice('已取消框选');
        return;
      }
      if (command === 'undo' || command === 'redo') {
        event.preventDefault();
        command === 'redo' ? redo() : undo();
        setNotice(command === 'redo' ? '已重做上一步' : '已撤销上一步');
        return;
      }
      if (command === 'delete' && selectedGroupId) {
        event.preventDefault();
        deleteGroup(selectedGroupId);
        setNotice('已删除当前分镜组，可按 Ctrl+Z 恢复');
        return;
      }
      if (command === 'add-group') {
        event.preventDefault();
        try {
          const group = addGroup();
          setNotice(group ? '已添加分镜组；框选保持，可继续按 Enter 添加补拍' : '请先框选 1–16 个声部');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '无法创建分镜组');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addGroup, deleteGroup, redo, selectedGroupId, setSelection, undo]);

  useEffect(() => {
    const handler = async (event: ClipboardEvent) => {
      if (!selectedGroup) return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'));
      if (!file) return;
      const shot = selectedGroup.shots[0];
      const id = `reference-${crypto.randomUUID()}`;
      await persistAssetUrl(id, await readFileAsDataUrl(file), 'reference-image', file.name || 'clipboard-reference.png');
      updateShot(selectedGroup.id, shot.id, { imageAssetId: id, referenceAssetId: undefined });
      setNotice(`已从剪贴板添加 ${shot.partName} 参考图`);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [persistAssetUrl, selectedGroup, updateShot]);

  const importScore = async (file: File) => {
    setBusy(true);
    setNotice('正在解析乐谱…');
    try {
      const isMscz = file.name.toLowerCase().endsWith('.mscz');
      let bytes: Uint8Array;
      if (isMscz) {
        const originalBytes = new Uint8Array(await file.arrayBuffer());
        setOriginalScore(originalBytes);
        const form = new FormData();
        form.set('score', file);
        const response = await fetch('/api/scores/convert', { method: 'POST', body: form });
        if (!response.ok) throw new Error((await response.json()).error || 'MSCZ 转换失败');
        bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        bytes = new Uint8Array(await file.arrayBuffer());
        setOriginalScore(undefined);
      }
      setScoreFilename(file.name);
      setSourceFormat(isMscz ? 'mscz' : 'musicxml');
      setScoreData(bytes);
      await repositoryRef.current.putAsset({ id: `score-original-${project.id}`, projectId: project.id, kind: 'score-original', filename: file.name, mimeType: file.type || 'application/octet-stream', blob: file });
      await repositoryRef.current.putAsset({ id: `score-musicxml-${project.id}`, projectId: project.id, kind: 'score-musicxml', filename: `${file.name.replace(/\.[^.]+$/, '')}.musicxml`, mimeType: 'application/vnd.recordare.musicxml+xml', blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/vnd.recordare.musicxml+xml' }) });
      setNotice('乐谱已载入；拖拽框选声部与小节，按 Enter 创建分镜');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '乐谱导入失败');
    } finally {
      setBusy(false);
    }
  };

  const onParts = useCallback((loaded: typeof parts) => {
    setParts(loaded);
    if (scoreFilename) setScore(scoreFilename, sourceFormat, loaded);
  }, [scoreFilename, setParts, setScore, sourceFormat]);
  const onPosition = useCallback((value: PlaybackPosition) => setPosition(value), []);
  const onPlayingChange = useCallback((value: boolean) => setPlaying(value), []);
  const onScoreError = useCallback((message: string) => setNotice(message), []);

  const toggleTrack = (index: number, mode: 'mute' | 'solo') => {
    const current = mode === 'mute' ? muted : soloed;
    const next = new Set(current);
    const enabled = !next.has(index);
    enabled ? next.add(index) : next.delete(index);
    if (mode === 'mute') {
      setMuted(next); scoreRef.current?.setTrackMute(index, enabled);
    } else {
      setSoloed(next); scoreRef.current?.setTrackSolo(index, enabled);
    }
  };

  const generateImage = async (group: ShotGroup, shot: Shot) => {
    if (!settingsValue.imageBaseUrl.trim() || !settingsValue.imageApiKey.trim()) { setSettingsOpen(true); setNotice('请先在设置中填写图像生成服务地址与 API Key'); return; }
    updateShot(group.id, shot.id, { generationStatus: 'generating', generationError: undefined });
    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: settingsValue.imageBaseUrl, apiKey: settingsValue.imageApiKey,
          prompt: buildImagePrompt(shot)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || payload.error || '示意图生成失败');
      const dataUrl = payload.data?.[0]?.b64_json
        ? `data:image/png;base64,${payload.data[0].b64_json}`
        : payload.data?.[0]?.url;
      if (!dataUrl) throw new Error('图像服务未返回图片');
      const imageAssetId = `generated-${crypto.randomUUID()}`;
      await persistAssetUrl(imageAssetId, dataUrl, 'generated-image', `${shot.partName}-storyboard.png`);
      updateShot(group.id, shot.id, { imageAssetId, generationStatus: 'ready' });
      setNotice(`${shot.partName} 示意图已生成`);
    } catch (error) {
      updateShot(group.id, shot.id, { generationStatus: 'error', generationError: error instanceof Error ? error.message : '生成失败' });
      setNotice(error instanceof Error ? error.message : '示意图生成失败');
    }
  };

  const pasteReference = async (group: ShotGroup, shot: Shot) => {
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.some((type) => type.startsWith('image/')));
      const type = item?.types.find((candidate) => candidate.startsWith('image/'));
      if (!item || !type) throw new Error('剪贴板中没有图片');
      const blob = await item.getType(type);
      const id = `reference-${crypto.randomUUID()}`;
      await persistAssetUrl(id, await readFileAsDataUrl(new File([blob], 'clipboard-reference.png', { type })), 'reference-image', 'clipboard-reference.png');
      updateShot(group.id, shot.id, { imageAssetId: id, referenceAssetId: undefined });
      setNotice(`已为 ${shot.partName} 粘贴参考图`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取剪贴板图片');
    }
  };

  const enhancePrompt = async (group: ShotGroup, shot: Shot) => {
    if (!settingsValue.llmBaseUrl.trim() || !settingsValue.llmApiKey.trim()) { setSettingsOpen(true); setNotice('请先在设置中填写 LLM 服务地址与 API Key'); return; }
    try {
      const response = await fetch('/api/prompts/enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: settingsValue.llmBaseUrl, apiKey: settingsValue.llmApiKey, model: settingsValue.llmModel, prompt: buildImagePrompt(shot) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '提示词生成失败');
      updateShot(group.id, shot.id, { description: payload.prompt });
      setNotice(`${shot.partName} 的拍摄描述已由 LLM 补充`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '提示词生成失败'); }
  };

  const exportProject = async () => {
    setBusy(true);
    try {
      await autosaveRef.current.flush();
      const saved = await repositoryRef.current.load(project.id);
      downloadBlob(await exportProjectPackage(project, saved?.assets ?? []), `${project.name}.waterclip`);
      setNotice('WaterClip 项目包已导出');
    } catch (error) { setNotice(error instanceof Error ? error.message : '项目导出失败'); }
    finally { setBusy(false); }
  };

  const openProject = async (file: File) => {
    setBusy(true);
    try {
      const imported = await importProjectPackage(file);
      await repositoryRef.current.save(imported.project, imported.assets);
      replaceProject(imported.project);
      for (const asset of imported.assets.filter((item) => item.kind.endsWith('image'))) setAssetUrl(asset.id, URL.createObjectURL(asset.blob));
      const score = imported.assets.find((asset) => asset.kind === 'score-musicxml');
      const original = imported.assets.find((asset) => asset.kind === 'score-original');
      if (score) {
        setScoreFilename(imported.project.score?.name ?? '项目乐谱.musicxml');
        const importedFormat = imported.project.score?.sourceFormat ?? 'musicxml';
        setSourceFormat(importedFormat);
        setScoreData(new Uint8Array(await score.blob.arrayBuffer()));
        setOriginalScore(importedFormat === 'mscz' && original ? new Uint8Array(await original.blob.arrayBuffer()) : undefined);
      }
      setNotice(`已打开项目「${imported.project.name}」`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '项目打开失败'); }
    finally { setBusy(false); }
  };

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { exportShotListXlsx } = await import('./export');
      const saved = await repositoryRef.current.load(project.id);
      const blob = await exportShotListXlsx(project, { assets: saved?.assets ?? [] });
      downloadBlob(blob, `${project.name}-分镜表.xlsx`);
      setNotice('分镜 XLSX 已导出');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'XLSX 导出失败'); }
    finally { setBusy(false); }
  };

  const exportPdf = async () => {
    if (!scoreData || !parts.length) { setNotice('请先导入并等待乐谱渲染完成'); return; }
    setBusy(true);
    setNotice('MuseScore 正在排版并叠加分镜标记…');
    try {
      const annotations = project.shotGroups.flatMap((group) => group.shots.map((shot) => ({
        partId: shot.partId,
        startMeasure: group.range.startMeasure,
        endMeasure: group.range.endMeasure,
        size: shot.size,
        description: shot.description,
      })));
      const form = new FormData();
      form.set('parts', JSON.stringify(parts.map((part) => ({ id: part.id, name: part.name, staffCount: Math.max(1, part.staffIds.length) }))));
      form.set('annotations', JSON.stringify(annotations));
      const exportScore = originalScore ?? scoreData;
      form.set('score', new Blob([exportScore.slice().buffer as ArrayBuffer], { type: originalScore ? 'application/vnd.musescore.score' : 'application/vnd.recordare.musicxml+xml' }), originalScore ? 'waterclip-score.mscz' : 'waterclip-score.musicxml');
      const response = await fetch('/api/scores/export-pdf', { method: 'POST', body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'PDF 导出失败' }));
        throw new Error(payload.error || 'PDF 导出失败');
      }
      downloadBlob(await response.blob(), `${project.name}-制片标记谱.pdf`);
      setNotice(`PDF 已导出 · ${annotations.length} 个分镜标记`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'PDF 导出失败');
    } finally {
      setBusy(false);
    }
  };

  const beginProjectRename = () => {
    setProjectNameDraft(project.name);
    setIsRenamingProject(true);
  };

  const finishProjectRename = () => {
    renameProject(projectNameDraft);
    setIsRenamingProject(false);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Music2 size={18} /></span><div><strong>WaterClip</strong><small>ENSEMBLE SHOT DESK</small></div></div>
        {isRenamingProject ? <div className="project-title is-renaming"><span className="status-dot" /><input className="project-name-input" aria-label="工程名称" autoFocus maxLength={100} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={finishProjectRename} onKeyDown={(event) => { if (event.key === 'Enter') finishProjectRename(); if (event.key === 'Escape') setIsRenamingProject(false); }} /><small>{project.score ? `${parts.length} 个声部` : '尚未导入乐谱'}</small></div> : <button type="button" className="project-title" title="重命名工程" onClick={beginProjectRename}><span className="status-dot" />{project.name}<small>{project.score ? `${parts.length} 个声部` : '尚未导入乐谱'}</small></button>}
        <div className="top-actions">
          <input ref={scoreInputRef} hidden type="file" accept=".mscz,.musicxml,.xml,.mxl" onChange={(e) => e.target.files?.[0] && importScore(e.target.files[0])} />
          <input ref={projectInputRef} hidden type="file" accept=".waterclip" onChange={(e) => e.target.files?.[0] && openProject(e.target.files[0])} />
          <button className="button primary" onClick={() => scoreInputRef.current?.click()} disabled={busy}><Upload size={16} />导入乐谱</button>
          <button className="icon-button" title="打开 WaterClip 项目" onClick={() => projectInputRef.current?.click()}><FolderOpen size={18} /></button>
          <button className="icon-button" title="导出 WaterClip 项目" onClick={exportProject} disabled={!project.score || busy}><Download size={18} /></button>
          <button className="icon-button" title="导出 XLSX" onClick={exportXlsx} disabled={!project.shotGroups.length || busy}><FileX size={18} /></button>
          <button className="icon-button" title="导出带分镜标记的 PDF" onClick={exportPdf} disabled={!scoreData || busy}><FileMusic size={18} /></button>
          <button className="icon-button" title="声部与分镜统计" onClick={() => setStatisticsOpen(true)}><BarChart3 size={18} /></button>
          <button className="icon-button" title="设置" onClick={() => { setSettingsDraft(settingsValue); setSettingsOpen(true); }}><Settings size={18} /></button>
        </div>
      </header>

      <main className={`workspace ${collapsedPanels.inspector ? 'inspector-collapsed' : ''} ${collapsedPanels.mixer ? 'mixer-collapsed' : ''} ${collapsedPanels.storyboard ? 'storyboard-collapsed' : ''}`}>
        <aside className={`inspector panel ${collapsedPanels.inspector ? 'collapsed' : ''}`}>
          <div className="panel-heading"><div><span className="eyebrow">SHOT PROPERTIES</span><h2>分镜属性</h2></div><div className="panel-tools"><span className="count-badge">{project.shotGroups.length}</span><button className="panel-toggle" title={collapsedPanels.inspector ? '展开分镜属性' : '收起分镜属性'} onClick={() => togglePanel('inspector')}>{collapsedPanels.inspector ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div></div>
          {!collapsedPanels.inspector && <>
          {selection && <div className="selection-summary"><span>已框选 · {selection.cells?.length ?? selection.partIds.length * (selection.endMeasure - selection.startMeasure + 1)} 个声部小节</span><strong>第 {selection.startMeasure}–{selection.endMeasure} 小节</strong><div>{selection.partIds.map((id) => <em key={id}>{parts.find((p) => p.id === id)?.name}</em>)}</div><button onClick={() => { try { const group = addGroup(); setNotice(group ? '已添加分镜组' : '请先框选 1–16 个声部'); } catch (error) { setNotice(error instanceof Error ? error.message : '无法创建分镜组'); } }}>按 Enter 添加分镜</button></div>}
          <div className="group-tabs">
            {project.shotGroups.map((group, index) => <button className={group.id === selectedGroupId ? 'active' : ''} key={group.id} onClick={() => selectGroup(group.id)}>#{String(index + 1).padStart(2, '0')}</button>)}
          </div>
          {selectedGroup ? <GroupEditor group={selectedGroup} groups={project.shotGroups} assetUrls={assetUrls} onUpdateShot={updateShot} onApplySameType={(groupId, shotId, scope) => { const count = applyShotToSameType(groupId, shotId, scope); const range = [scope.image && '参考图', scope.description && '描述'].filter(Boolean).join('和'); setNotice(count ? `已将${range}应用到 ${count} 个同类型镜头` : '没有可应用的同类型镜头'); }} onOccurrence={updateRangeOccurrence} onLayout={updateLayout} onSwap={swapGroupSlots} onDuplicate={duplicateGroupShot} onDelete={deleteGroup} onGenerate={generateImage} onEnhance={enhancePrompt} onPaste={pasteReference} onSetAsset={(id, dataUrl, filename) => persistAssetUrl(id, dataUrl, 'reference-image', filename)} /> : <div className="empty-inspector"><Aperture size={32} /><h3>等待取景</h3><p>在乐谱中拖拽框选声部和小节，再按 Enter 创建分镜。</p></div>}
          </>}
        </aside>

        <section className="score-column panel">
          <div className="score-toolbar">
            <button className="transport" aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停' : '播放（音源未就绪时会自动排队）'} disabled={!scoreData} onClick={() => scoreRef.current?.playPause()}>{playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
            <span className="timecode">{formatTime(position.currentTime)}</span>
            <div className="scrubber-track">
              <input aria-label="播放位置" className="scrubber" type="range" min="0" max="1000" value={position.endTick ? Math.round(position.currentTick / position.endTick * 1000) : 0} onChange={(e) => scoreRef.current?.seekRatio(Number(e.target.value) / 1000)} />
              <div className="section-markers" aria-label="乐段导航">{sections.map((section) => <button key={section.label} style={{ left: `${section.ratio * 100}%` }} title={`跳至 ${section.label} 段 · 第 ${section.measure} 小节`} onClick={() => scoreRef.current?.seekMeasure(section.measure)}>{section.label}</button>)}</div>
            </div>
            <span className="timecode muted-text">{formatTime(position.endTime)}</span>
            <div className="measure-readout">M.{position.measure}<small>第 {position.occurrence} 遍</small></div>
            <label className="zoom-control"><Maximize2 size={14} /><input type="range" min="0.55" max="1.25" step="0.05" value={zoom} onChange={(e) => { const value = Number(e.target.value); setZoom(value); scoreRef.current?.setZoom(value); }} /></label>
          </div>
          <div className="score-frame" data-active-shot-count={activeShotCells.length}>
            {scoreData ? <ScoreCanvas ref={scoreRef} data={scoreData} selection={selection} activeShotCells={activeShotCells} hardwareAcceleration={settingsValue.hardwareAcceleration} autoPageTurn={settingsValue.autoPageTurn} followPlayback={settingsValue.timelineFollow} mutedTracks={muted} soloTracks={soloed} onToggleTrack={toggleTrack} levelBus={levelBus} onParts={onParts} onSelection={setSelection} onPosition={onPosition} onPlayingChange={onPlayingChange} onSections={setSections} onError={onScoreError} /> : <div className="score-empty"><div className="empty-score-sheet"><FileMusic size={44} /><h1>把乐谱放上导演谱台</h1><p>支持 MSCZ、MusicXML、XML 与 MXL。导入后即可试听、框选和编排分镜。</p><button className="button primary" onClick={() => scoreInputRef.current?.click()}>选择乐谱</button></div></div>}
          </div>
        </section>

        <aside className={`mixer panel ${collapsedPanels.mixer ? 'collapsed' : ''}`}>
          <div className="panel-heading"><div><span className="eyebrow">PART MIXER</span><h2>声部监听</h2></div><div className="panel-tools"><SlidersHorizontal size={17} /><button className="panel-toggle" title={collapsedPanels.mixer ? '展开声部监听' : '收起声部监听'} onClick={() => togglePanel('mixer')}>{collapsedPanels.mixer ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button></div></div>
          {!collapsedPanels.mixer && <>
          <div className="mixer-list">
            {parts.length ? parts.map((part, index) => <div className="track-row" key={part.id}><span className="track-number">{String(index + 1).padStart(2, '0')}</span><div className="track-name"><strong>{part.name}</strong><small>{part.staffIds.length} 谱表</small></div><TrackLevelMeter bus={levelBus} track={index} audible={isTrackAudible(index, muted, soloed)} /><button className={muted.has(index) ? 'track-toggle active mute' : 'track-toggle'} onClick={() => toggleTrack(index, 'mute')} title="静音">M</button><button className={soloed.has(index) ? 'track-toggle active solo' : 'track-toggle'} onClick={() => toggleTrack(index, 'solo')} title="独奏">S</button></div>) : <div className="mixer-empty"><Volume2 size={24} /><p>导入乐谱后显示声部</p></div>}
          </div>
          <div className="engine-status"><span className={health?.museScore?.available ? 'online' : ''} />MuseScore {health?.museScore?.available ? health.museScore.version : '未连接'}</div>
          </>}
        </aside>

        <section className={`storyboard panel ${collapsedPanels.storyboard ? 'collapsed' : ''}`}>
          <div className="storyboard-header"><div><span className="eyebrow">STORYBOARD TIMELINE</span><h2>故事板</h2></div><div className="panel-tools"><div className="legend"><span><i className="active-key" />播放命中</span><span>{project.shotGroups.length} 组 / {project.shotGroups.reduce((n, g) => n + g.shots.length, 0)} 镜</span></div><button className="panel-toggle" title={collapsedPanels.storyboard ? '展开故事板' : '收起故事板'} onClick={() => togglePanel('storyboard')}>{collapsedPanels.storyboard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></div></div>
          {!collapsedPanels.storyboard &&
          <div className="story-track">
            {storyboardGroups.length ? storyboardGroups.map((group, index) => <button ref={(node) => { if (node) storyCardRefs.current.set(group.id, node); else storyCardRefs.current.delete(group.id); }} key={group.id} className={`story-card ${activeGroups.some((g) => g.id === group.id) ? 'is-active' : ''} ${group.id === selectedGroupId ? 'is-selected' : ''}`} onClick={() => chooseStoryboardGroup(group)}><div className="story-picture"><SplitPreview group={group} assetUrls={assetUrls} compact /><span className="story-index">{String(index + 1).padStart(2, '0')}</span></div><div className="story-meta"><strong>M.{group.range.startMeasure}{group.range.endMeasure !== group.range.startMeasure ? `–${group.range.endMeasure}` : ''}</strong><span>{layoutLabel(group.layout)}</span><small>{group.shots.map((shot) => shot.partName).join(' · ')}</small></div></button>) : <div className="story-empty"><span className="cue-line" /><p>分镜会按乐谱时间排列在这里</p></div>}
          </div>}
        </section>
      </main>

      <div className="notice-bar" role="status" aria-live="polite"><span className={busy ? 'pulse' : ''} />{notice}</div>
      {settingsOpen && <SettingsDialog value={settingsDraft} onChange={setSettingsDraft} onClose={() => setSettingsOpen(false)} onSave={() => { setSettings(settingsDraft); setSettingsOpen(false); setNotice('设置已保存在本机'); }} />}
      {statisticsOpen && <StatisticsDialog values={partStatistics} onClose={() => setStatisticsOpen(false)} />}
    </div>
  );
}

interface GroupEditorProps {
  group: ShotGroup; groups: ShotGroup[]; assetUrls: Record<string, string>;
  onUpdateShot(groupId: string, shotId: string, patch: Partial<Shot>): void;
  onApplySameType(groupId: string, shotId: string, scope: ApplyShotScope): void;
  onOccurrence(groupId: string, occurrence: number | 'all'): void;
  onLayout(groupId: string, layout: SplitLayout): void;
  onSwap(groupId: string, from: number, to: number): void;
  onDuplicate(groupId: string, shotId: string): void;
  onDelete(groupId: string): void;
  onGenerate(group: ShotGroup, shot: Shot): void;
  onEnhance(group: ShotGroup, shot: Shot): void;
  onPaste(group: ShotGroup, shot: Shot): void;
  onSetAsset(assetId: string, dataUrl: string, filename: string): void | Promise<void>;
}

function GroupEditor({ group, groups, assetUrls, onUpdateShot, onApplySameType, onOccurrence, onLayout, onSwap, onDuplicate, onDelete, onGenerate, onEnhance, onPaste, onSetAsset }: GroupEditorProps) {
  const [applyScopes, setApplyScopes] = useState<Record<string, ApplyShotScope>>({});
  const scopeFor = (shotId: string) => applyScopes[shotId] ?? { image: true, description: true };
  const updateScope = (shotId: string, patch: Partial<ApplyShotScope>) => setApplyScopes((value) => ({ ...value, [shotId]: { ...scopeFor(shotId), ...patch } }));

  return <div className="group-editor">
    <div className="range-strip"><span>M.{group.range.startMeasure}–{group.range.endMeasure}</span><select aria-label="播放遍次" value={group.range.occurrence} onChange={(event) => onOccurrence(group.id, event.target.value === 'all' ? 'all' : Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{occurrenceLabel(value)}</option>)}<option value="all">{occurrenceLabel('all')}</option></select><button onClick={() => onDelete(group.id)} title="删除分镜组"><Trash2 size={15} /></button></div>
    <SplitPreview group={group} assetUrls={assetUrls} onSwap={(a, b) => onSwap(group.id, a, b)} />
    <label className="field-label">分屏编排<select value={JSON.stringify(group.layout)} onChange={(e) => onLayout(group.id, JSON.parse(e.target.value))}>{availableLayouts(group.shots.length).map((layout) => <option key={JSON.stringify(layout)} value={JSON.stringify(layout)}>{layoutLabel(layout)}</option>)}</select></label>
    <div className="shot-list">{group.shots.map((shot) => {
      const currentImageId = shot.imageAssetId ?? shot.referenceAssetId;
      const scope = scopeFor(shot.id);
      const matchCount = groups.reduce((count, candidateGroup) => count + candidateGroup.shots.filter((candidate) => candidate.id !== shot.id && candidate.partId === shot.partId && candidate.size === shot.size).length, 0);
      return <article className="shot-editor" key={shot.id}>
        <div className="shot-editor-head"><span className="instrument-chip">{shot.partName}</span><button onClick={() => onDuplicate(group.id, shot.id)} title="复制补拍"><Copy size={14} /></button></div>
        <div className="shot-size-row">{SHOT_SIZES.map((size) => <button className={shot.size === size ? 'active' : ''} key={size} onClick={() => onUpdateShot(group.id, shot.id, { size: size as ShotSize })}>{size}</button>)}</div>
        <textarea value={shot.description} onChange={(e) => onUpdateShot(group.id, shot.id, { description: e.target.value })} placeholder="例如：低机位沿琴弓推进，保持手部动作清晰" />
        <button className="prompt-button" onClick={() => onEnhance(group, shot)}><Sparkles size={13} />LLM 辅助完善拍摄描述</button>
        <div className="reference-row"><label className="reference-upload"><ImagePlus size={14} />{currentImageId ? '替换参考图' : '上传参考图'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const id = `reference-${crypto.randomUUID()}`; await onSetAsset(id, await readFileAsDataUrl(file), file.name); onUpdateShot(group.id, shot.id, { imageAssetId: id, referenceAssetId: undefined }); e.currentTarget.value = ''; }} /></label><button type="button" onClick={() => onPaste(group, shot)}><ClipboardPaste size={13} />粘贴剪贴板</button>{currentImageId && <button onClick={() => onUpdateShot(group.id, shot.id, { imageAssetId: undefined, referenceAssetId: undefined })}><X size={13} />移除</button>}</div>
        <div className="apply-scope-row"><span>应用到同类型</span><label className="apply-scope-option"><input type="checkbox" checked={scope.image} onChange={(event) => updateScope(shot.id, { image: event.target.checked })} />参考图</label><label className="apply-scope-option"><input type="checkbox" checked={scope.description} onChange={(event) => updateScope(shot.id, { description: event.target.checked })} />描述</label><button type="button" disabled={!matchCount || (!scope.image && !scope.description)} onClick={() => onApplySameType(group.id, shot.id, scope)}>应用{matchCount ? `（${matchCount}）` : ''}</button></div>
        <button className="generate-button" disabled={!shot.description.trim() || shot.generationStatus === 'generating'} onClick={() => onGenerate(group, shot)}>{shot.generationStatus === 'generating' ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}生成 1280×720 示意图</button>{shot.generationError && <p className="field-error">{shot.generationError}</p>}
      </article>;
    })}</div>
  </div>;
}

function SettingsDialog({ value, onChange, onClose, onSave }: { value: AppSettings; onChange(value: AppSettings): void; onClose(): void; onSave(): void }) {
  return <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="设置">
      <header><div><span className="eyebrow">LOCAL SETTINGS</span><h2>本机工具与服务设置</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
      <div className="settings-body">
        <div className="settings-section"><h3>谱面与播放</h3>
          <label className="setting-toggle"><input type="checkbox" checked={value.timelineFollow} onChange={(e) => onChange({ ...value, timelineFollow: e.target.checked })} /><span><strong>故事板、播放进度与谱面联动</strong><small>播放时自动跟随当前分镜；点击故事板会跳到对应小节。默认开启。</small></span></label>
          <label className="setting-toggle"><input type="checkbox" checked={value.autoPageTurn} onChange={(e) => onChange({ ...value, autoPageTurn: e.target.checked })} /><span><strong>播放时自动整页翻谱</strong><small>当前页播放完才向右移动，并保留上一页最后一小节作为衔接。</small></span></label>
          <label className="setting-toggle"><input type="checkbox" checked={value.hardwareAcceleration} onChange={(e) => onChange({ ...value, hardwareAcceleration: e.target.checked })} /><span><strong>渲染硬件加速</strong><small>优先使用浏览器合成层与工作线程；遇到显卡兼容问题时可关闭。</small></span></label>
        </div>
        <div className="settings-section service-credentials"><h3>图像生成服务</h3>
          <label>图像 Base URL<input value={value.imageBaseUrl} onChange={(e) => onChange({ ...value, imageBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></label>
          <label>图像 API Key<input type="password" value={value.imageApiKey} onChange={(e) => onChange({ ...value, imageApiKey: e.target.value })} placeholder="sk-…" /></label>
          <div className="fixed-model"><span>模型</span><strong>gpt-image-2</strong><span>尺寸</span><strong>1280 × 720</strong><span>质量</span><strong>Medium</strong></div>
        </div>
        <div className="settings-section service-credentials"><h3>LLM 提示词服务</h3>
          <label>LLM Base URL<input value={value.llmBaseUrl} onChange={(e) => onChange({ ...value, llmBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></label>
          <label>LLM API Key<input type="password" value={value.llmApiKey} onChange={(e) => onChange({ ...value, llmApiKey: e.target.value })} placeholder="sk-…" /></label>
          <label>LLM 模型<input value={value.llmModel} onChange={(e) => onChange({ ...value, llmModel: e.target.value })} placeholder="gpt-5-mini" /><small>仅用于辅助完善参考图拍摄描述。</small></label>
        </div>
        <div className="security-note"><VolumeX size={17} /><p><strong>两套密钥彼此独立，仅保存在这台电脑的浏览器中。</strong><br />它们不会写入项目包，也不会进入服务端日志。</p></div>
      </div>
      <footer><span className="version-label">WaterClip v0.1.0</span><button className="button" onClick={onClose}>取消</button><button className="button primary" onClick={onSave}>保存设置</button></footer>
    </section>
  </div>;
}

function StatisticsDialog({ values, onClose }: { values: ReturnType<typeof buildPartStatistics>; onClose(): void }) {
  const totals = values.reduce((sum, value) => ({ measures: sum.measures + value.selectedMeasureCount, shots: sum.shots + value.shotCount }), { measures: 0, shots: 0 });
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="settings-dialog statistics-dialog" role="dialog" aria-modal="true" aria-label="声部统计"><header><div><span className="eyebrow">COVERAGE REPORT</span><h2>声部与分镜统计</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header><div className="statistics-summary"><strong>{values.length}</strong><span>声部</span><strong>{totals.measures}</strong><span>覆盖小节次</span><strong>{totals.shots}</strong><span>子镜头</span></div><div className="statistics-list">{values.map((value) => <div key={value.partId}><strong>{value.partName}</strong><span>{value.selectedMeasureCount} 小节</span><span>{value.shotCount} 分镜</span></div>)}</div></section></div>;
}
