import { ChangeEvent, CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  CheckSquare,
  ChevronRight,
  Circle,
  Clock3,
  Heart,
  Home,
  Image as ImageIcon,
  KeyRound,
  Link2,
  ListTodo,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { createMemoryDraftFromPlan, getNextMilestone, getTimelineEntries } from './lib/domain';
import { getRelationshipDuration } from './lib/dates';
import { validateImageFile } from './lib/media';
import { deleteLocalAsset, hydrateLocalPhotoSources } from './lib/local-media';
import { createSpaceRepository } from './lib/repository';
import { getRuntimeConfig, type RuntimeConfig } from './lib/runtime-config';
import {
  endDemoSession,
  EMPTY_SPACE_DATA,
  hasDemoSession,
  loadSpaceData,
  resetSpaceData,
  startDemoSession
} from './lib/storage';
import type {
  MemoryEntry,
  MilestoneEntry,
  Photo,
  PlanItem,
  PlanStatus,
  PlanType,
  SpaceData,
  TimelineDisplayEntry,
  TimelineEntry,
  ViewKey
} from './types';

const navItems: { key: ViewKey; label: string; icon: typeof Home }[] = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'timeline', label: '时间线', icon: Clock3 },
  { key: 'photos', label: '照片', icon: ImageIcon },
  { key: 'plans', label: '计划', icon: CheckSquare },
  { key: 'settings', label: '设置', icon: Settings2 }
];

type SheetState =
  | { type: 'timeline-detail'; entry: TimelineDisplayEntry }
  | { type: 'memory-form'; entry?: MemoryEntry; draft?: MemoryEntry }
  | { type: 'milestone-form'; entry?: MilestoneEntry }
  | { type: 'plan-form'; plan?: PlanItem }
  | { type: 'photo-form'; photo: Photo }
  | { type: 'settings-form' }
  | null;

type UploadItem = {
  id: string;
  name: string;
  file: File;
  progress: number;
  status: 'preparing' | 'uploading' | 'done' | 'failed';
  error?: string;
};

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }): string {
  if (!value) return '尚未设置';
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value?: string): string {
  if (!value) return '未设置日期';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatTimelineDate(entry: TimelineDisplayEntry, value = entry.date): string {
  return `${formatDate(value)}${entry.type === 'milestone' && entry.time ? ` ${entry.time}` : ''}`;
}

function App() {
  const config = getRuntimeConfig();
  const [authorized, setAuthorized] = useState(hasDemoSession());

  if (!authorized) return <AccessGate publicDemo={config.publicDemo} onEnter={() => { startDemoSession(); setAuthorized(true); }} />;

  return <SpaceApp config={config} onLock={() => { endDemoSession(); setAuthorized(false); }} />;
}

function AccessGate({ publicDemo, onEnter }: { publicDemo: boolean; onEnter: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password.trim().length < 4) {
      setError('演示模式请输入至少 4 位密码。');
      return;
    }
    onEnter();
  }

  return (
    <main className="access-screen">
      <div className="access-art" aria-hidden="true">
        <span className="access-stamp">two of us</span>
        <div className="access-heart"><Heart size={54} fill="currentColor" strokeWidth={1.4} /></div>
        <span className="access-note">keep the little things</span>
      </div>
      <section className="access-panel">
        <div className="brand-lockup"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>our little space</span></div>
        <div className="eyebrow">PRIVATE SPACE / 01</div>
        <h1>只属于你们的<br /><em>小小空间</em></h1>
        <p className="access-copy">把重要的日子、照片和还想一起完成的事，放在一个只属于你们的地方。</p>
        <form className="access-form" onSubmit={submit}>
          <label htmlFor="space-password">共同密码</label>
          <input className="visually-hidden" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" value="our-little-space" readOnly />
          <div className="input-with-icon"><KeyRound size={18} /><input id="space-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="输入你们的密码" autoComplete="new-password" autoFocus /></div>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-dark button-wide" type="submit"><LockKeyhole size={17} />进入我们的空间</button>
        </form>
        <p className="access-footnote"><LockKeyhole size={14} /> {publicDemo ? '当前是公开演示空间，请不要上传隐私照片。' : '当前是本地演示模式，接入 Supabase 后启用真实私密链接验证。'}</p>
      </section>
    </main>
  );
}

function SpaceApp({ config, onLock }: { config: RuntimeConfig; onLock: () => void }) {
  const repository = useMemo(() => createSpaceRepository(config), [config]);
  const remoteMode = config.dataMode === 'supabase' && Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const [data, setData] = useState<SpaceData>(() => remoteMode ? { ...EMPTY_SPACE_DATA, timeline: [], photos: [], plans: [] } : loadSpaceData());
  const [dataReady, setDataReady] = useState(!remoteMode);
  const [view, setView] = useState<ViewKey>('home');
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState('');
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const skipRemoteSave = useRef(false);

  useEffect(() => {
    if (!remoteMode) return;
    let cancelled = false;
    repository.load().then((loadedData) => {
      if (cancelled) return;
      skipRemoteSave.current = true;
      setData(loadedData);
      setDataReady(true);
    }).catch(() => {
      if (cancelled) return;
      setToast('共享空间读取失败，请检查 Supabase 配置。');
    });
    return () => { cancelled = true; };
  }, [remoteMode, repository]);
  useEffect(() => {
    if (!remoteMode || !repository.subscribe) return;
    return repository.subscribe((loadedData) => {
      skipRemoteSave.current = true;
      setData(loadedData);
      setDataReady(true);
    });
  }, [remoteMode, repository]);
  useEffect(() => {
    if (!dataReady) return;
    if (skipRemoteSave.current) {
      skipRemoteSave.current = false;
      return;
    }
    void repository.saveSnapshot(data).catch(() => setToast('空间同步失败，请稍后重试。'));
  }, [data, dataReady, repository]);
  useEffect(() => {
    if (remoteMode) return;
    let cancelled = false;
    hydrateLocalPhotoSources(data.photos).then((photos) => {
      if (cancelled || photos.every((photo, index) => photo.src === data.photos[index]?.src)) return;
      setData((current) => ({ ...current, photos }));
    }).catch(() => setToast('本地照片读取失败，请重试。'));
    return () => { cancelled = true; };
  }, [remoteMode]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const timeline = useMemo(() => getTimelineEntries(data, now), [data, now]);
  const relationship = getRelationshipDuration(data.relationshipStart, now);
  const nextMilestone = useMemo(() => getNextMilestone(data, now), [data, now]);
  const pageTitle = navItems.find((item) => item.key === view)?.label ?? '首页';

  useEffect(() => {
    if (view !== 'timeline' || !focusEntryId) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(`timeline-${focusEntryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusEntryId(null);
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [view, focusEntryId]);

  function updateData(updater: (current: SpaceData) => SpaceData, message?: string) {
    setData((current) => updater(current));
    if (message) setToast(message);
  }

  function openView(nextView: ViewKey, entryId?: string) {
    setView(nextView);
    if (entryId) setFocusEntryId(entryId);
  }

  function saveTimelineEntry(entry: TimelineEntry) {
    updateData((current) => {
      const exists = current.timeline.some((item) => item.id === entry.id);
      return { ...current, timeline: exists ? current.timeline.map((item) => item.id === entry.id ? entry : item) : [entry, ...current.timeline] };
    }, entry.type === 'memory' ? '回忆已经放进时间线。' : '重要日子已经记下了。');
    setSheet(null);
  }

  function deleteTimelineEntry(entry: TimelineDisplayEntry) {
    if (entry.type === 'milestone' && entry.systemRole) {
      setToast('恋爱开始日请在设置中修改，不能从时间线删除。');
      return;
    }
    if (!window.confirm(`确定删除“${entry.title}”吗？照片不会被删除。`)) return;
    updateData((current) => ({
      ...current,
      timeline: current.timeline.filter((item) => item.id !== entry.id),
      photos: current.photos.map((photo) => photo.timelineEntryId === entry.id ? { ...photo, timelineEntryId: undefined } : photo)
    }), '这条内容已经移除。');
    setSheet(null);
  }

  function savePlan(plan: PlanItem) {
    const normalized = plan.status === '已完成' && !plan.completedAt ? { ...plan, completedAt: todayString() } : plan.status !== '已完成' ? { ...plan, completedAt: undefined } : plan;
    updateData((current) => {
      const exists = current.plans.some((item) => item.id === normalized.id);
      return { ...current, plans: exists ? current.plans.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current.plans] };
    }, '计划已经更新。');
    setSheet(null);
  }

  function deletePlan(plan: PlanItem) {
    if (!window.confirm(`确定删除“${plan.title}”吗？`)) return;
    updateData((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== plan.id) }), '计划已经移除。');
  }

  function savePhoto(photo: Photo) {
    updateData((current) => ({ ...current, photos: current.photos.map((item) => item.id === photo.id ? photo : item) }), '照片信息已经更新。');
    setSheet(null);
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`确定删除“${photo.caption}”吗？`)) return;
    try {
      await repository.deletePhoto(photo);
    } catch {
      setToast('照片删除失败，请重试。');
      return;
    }
    if (photo.assetKey && photo.src.startsWith('blob:')) URL.revokeObjectURL(photo.src);
    if (photo.assetKey) void deleteLocalAsset(photo.assetKey);
    updateData((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== photo.id),
      timeline: current.timeline.map((entry) => ({ ...entry, photoIds: entry.photoIds.filter((id) => id !== photo.id) }))
    }), '照片已经删除。');
    setSheet(null);
  }

  async function startUpload(item: UploadItem) {
    try {
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'preparing', progress: 20 } : upload));
      const photoId = newId('photo');
      const photo = await repository.uploadPhoto(item.file, { id: photoId, caption: item.name, date: todayString() });
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'uploading', progress: 75 } : upload));
      updateData((current) => ({ ...current, photos: [photo, ...current.photos] }));
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, progress: 100, status: 'done' } : upload));
      setToast('照片已经加入照片墙。');
    } catch (error) {
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'failed', error: error instanceof Error ? error.message : '读取失败' } : upload));
    }
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const items: UploadItem[] = [];
    files.forEach((file) => {
      const validationError = validateImageFile(file);
      if (validationError) {
        setToast(`${file.name}：${validationError}`);
        return;
      }
      items.push({ id: newId('upload'), name: file.name, file, progress: 0, status: 'preparing' });
    });
    setUploads((current) => [...items, ...current]);
    items.forEach(startUpload);
    event.target.value = '';
  }

  function retryUpload(item: UploadItem) {
    const retry = { ...item, progress: 0, status: 'preparing' as const, error: undefined };
    setUploads((current) => current.map((upload) => upload.id === item.id ? retry : upload));
    void startUpload(retry);
  }

  function resetSpace() {
    if (!window.confirm('要清空这个空间吗？当前内容会被移除。')) return;
    if (!remoteMode) {
      data.photos.forEach((photo) => {
        if (photo.assetKey) void deleteLocalAsset(photo.assetKey);
        if (photo.assetKey && photo.src.startsWith('blob:')) URL.revokeObjectURL(photo.src);
      });
    }
    setData(remoteMode ? { ...EMPTY_SPACE_DATA, timeline: [], photos: [], plans: [] } : resetSpaceData());
    setToast('空间已经清空。');
  }

  function saveRelationshipStart(relationshipStart: string | null) {
    updateData((current) => ({ ...current, relationshipStart }), '开始日期已经更新。');
    setSheet(null);
  }

  const recentEntry = timeline.find((entry) => entry.type === 'memory') ?? timeline[0];
  const recentPhoto = recentEntry ? data.photos.find((photo) => photo.timelineEntryId === recentEntry.id || recentEntry.photoIds.includes(photo.id)) ?? data.photos[0] : data.photos[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><div><strong>our little space</strong><small>just us, in one place</small></div></div>
        <div className="space-card"><div className="space-card-top"><span className="status-dot" />{config.publicDemo ? '公开演示' : remoteMode ? '共享空间' : '本地空间'}</div><strong>{data.spaceName}</strong><span>{config.publicDemo ? '请勿放入隐私照片' : '两个人共同编辑'}</span></div>
        <nav className="desktop-nav" aria-label="主要导航">{navItems.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
        <div className="sidebar-bottom"><button className="quiet-button" onClick={onLock}><LockKeyhole size={17} />锁定空间</button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><span className="mobile-kicker">OUR LITTLE SPACE</span><h2>{pageTitle}</h2></div><div className="topbar-actions"><span className="sync-status"><span className="status-dot" />{remoteMode ? '共享空间已同步' : '本地已保存'}</span><button className="avatar-button" title="设置" aria-label="设置" onClick={() => setView('settings')}>A<span>+</span></button></div></header>
        <div className="page-content">
          {view === 'home' && <Dashboard data={data} relationship={relationship} nextMilestone={nextMilestone} recentEntry={recentEntry} recentPhoto={recentPhoto} openView={openView} onAddMemory={() => setSheet({ type: 'memory-form' })} onAddMilestone={() => setSheet({ type: 'milestone-form' })} onAddPlan={() => setSheet({ type: 'plan-form' })} onSetRelationshipStart={() => setSheet({ type: 'settings-form' })} onTogglePlan={(plan) => savePlan({ ...plan, status: plan.status === '已完成' ? '计划中' : '已完成' })} />}
          {view === 'timeline' && <TimelineView entries={timeline} photos={data.photos} onAddMemory={() => setSheet({ type: 'memory-form' })} onAddMilestone={() => setSheet({ type: 'milestone-form' })} onOpen={(entry) => setSheet({ type: 'timeline-detail', entry })} onEdit={(entry) => setSheet(entry.type === 'memory' ? { type: 'memory-form', entry } : { type: 'milestone-form', entry })} onDelete={deleteTimelineEntry} />}
          {view === 'photos' && <PhotosView photos={data.photos} uploads={uploads} timeline={timeline} onUpload={addPhotos} onEdit={(photo) => setSheet({ type: 'photo-form', photo })} onDelete={deletePhoto} onClearUpload={(id) => setUploads((current) => current.filter((item) => item.id !== id))} onRetry={retryUpload} />}
          {view === 'plans' && <PlansView plans={data.plans} onAdd={() => setSheet({ type: 'plan-form' })} onEdit={(plan) => setSheet({ type: 'plan-form', plan })} onDelete={deletePlan} onToggle={(plan) => savePlan({ ...plan, status: plan.status === '已完成' ? '计划中' : '已完成' })} onWriteMemory={(plan) => setSheet({ type: 'memory-form', draft: createMemoryDraftFromPlan(plan, todayString()) })} />}
          {view === 'settings' && <SettingsView data={data} publicDemo={config.publicDemo} remoteMode={remoteMode} onReset={resetSpace} onEditStart={() => setSheet({ type: 'settings-form' })} onLock={onLock} />}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="移动端导航">{navItems.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} compact />)}</nav>
      {sheet?.type === 'timeline-detail' && <TimelineDetailSheet entry={sheet.entry} photos={data.photos} onClose={() => setSheet(null)} onEdit={() => setSheet(sheet.entry.type === 'memory' ? { type: 'memory-form', entry: sheet.entry } : { type: 'milestone-form', entry: sheet.entry })} onDelete={() => deleteTimelineEntry(sheet.entry)} />}
      {sheet?.type === 'memory-form' && <MemoryForm entry={sheet.entry} draft={sheet.draft} onClose={() => setSheet(null)} onSubmit={saveTimelineEntry} />}
      {sheet?.type === 'milestone-form' && <MilestoneForm entry={sheet.entry} onClose={() => setSheet(null)} onSubmit={saveTimelineEntry} />}
      {sheet?.type === 'plan-form' && <PlanForm plan={sheet.plan} onClose={() => setSheet(null)} onSubmit={savePlan} />}
      {sheet?.type === 'photo-form' && <PhotoForm photo={sheet.photo} timeline={timeline} onClose={() => setSheet(null)} onSubmit={savePhoto} />}
      {sheet?.type === 'settings-form' && <RelationshipSettingsForm relationshipStart={data.relationshipStart} onClose={() => setSheet(null)} onSubmit={saveRelationshipStart} />}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  );
}

function NavButton({ item, active, onClick, compact = false }: { item: typeof navItems[number]; active: boolean; onClick: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return <button className={`nav-button ${active ? 'active' : ''} ${compact ? 'compact' : ''}`} onClick={onClick}><Icon size={compact ? 19 : 18} /><span>{item.label}</span></button>;
}

function Dashboard({ data, relationship, nextMilestone, recentEntry, recentPhoto, openView, onAddMemory, onAddMilestone, onAddPlan, onSetRelationshipStart, onTogglePlan }: { data: SpaceData; relationship: ReturnType<typeof getRelationshipDuration>; nextMilestone?: TimelineDisplayEntry; recentEntry?: TimelineDisplayEntry; recentPhoto?: Photo; openView: (view: ViewKey, id?: string) => void; onAddMemory: () => void; onAddMilestone: () => void; onAddPlan: () => void; onSetRelationshipStart: () => void; onTogglePlan: (plan: PlanItem) => void }) {
  const openPlans = data.plans.filter((plan) => plan.status !== '已完成' && plan.status !== '搁置');
  const today = formatDate(new Date().toISOString().slice(0, 10), { weekday: 'long', month: 'long', day: 'numeric' });
  const planSummary = (plan: PlanItem) => plan.location ?? plan.note ?? (plan.dueDate ? formatShortDate(plan.dueDate) : '还没有补充说明');
  return <div className="dashboard-stack">
    <section className="welcome-band"><div><span className="eyebrow">{today}</span><h1>你好，<em>你们。</em></h1><p>今天也有一些小事，值得一起记住。</p></div><div className="welcome-illustration"><span>two people,<br />one timeline</span><Heart size={48} fill="currentColor" strokeWidth={1.3} /></div></section>
    <section className="relationship-grid"><div className="relationship-panel">{relationship ? <><div className="panel-label">我们已经</div><div className="duration"><strong>{relationship.years}</strong><span>年</span><strong>{relationship.months}</strong><span>个月</span><strong>{relationship.days}</strong><span>天</span></div><div className="duration-foot">共走过 {relationship.totalDays.toLocaleString()} 天 <span>·</span> 还会有更多</div><div className="relationship-line" /></> : <div className="relationship-empty"><div className="panel-label">OUR STARTING POINT</div><h3>还没有设置开始日</h3><p>填写后，这里会开始记录你们一起走过的时间。</p><button className="button button-light" onClick={onSetRelationshipStart}><CalendarDays size={16} />设置开始日</button></div>}</div><div className="anniversary-panel"><div className="panel-topline"><span className="tag tag-coral">UP NEXT</span>{nextMilestone && <button className="text-button" onClick={() => openView('timeline', nextMilestone.id)}>去时间线 <ArrowUpRight size={15} /></button>}</div><h3>{nextMilestone?.title ?? '添加一个重要日子'}</h3><p>{nextMilestone ? `${formatTimelineDate(nextMilestone, nextMilestone.nextOccurrence ?? nextMilestone.date)}${nextMilestone.location ? ` · ${nextMilestone.location}` : ''}` : '把下一个想庆祝的日子放进来。'}</p><div className="big-countdown">{nextMilestone ? <><strong>{nextMilestone.countdownDays}</strong><span>天后</span></> : <button className="button button-light" onClick={onAddMilestone}><Plus size={16} />添加日子</button>}</div></div></section>
    <div className="section-heading"><div><span className="eyebrow">THE STORY SO FAR</span><h2>最近发生的事</h2></div><button className="text-button" onClick={() => openView('timeline')}>查看时间线 <ArrowUpRight size={15} /></button></div>
    <section className="home-grid"><article className="memory-feature" onClick={() => recentEntry && openView('timeline', recentEntry.id)}><div className="feature-image" style={{ backgroundImage: recentPhoto ? `url(${recentPhoto.src})` : undefined }}><span className="image-caption">{recentPhoto?.caption ?? '还没有照片'}</span></div><div className="feature-copy"><div className="item-meta"><span>{recentEntry ? formatDate(recentEntry.date, { year: 'numeric', month: 'short', day: 'numeric' }) : '还没有回忆'}</span><span>{recentEntry?.location}</span></div><h3>{recentEntry?.title ?? '记录你们的第一条回忆'}</h3><p>{recentEntry?.type === 'memory' ? recentEntry.body : recentEntry?.note ?? '从一句话开始，把重要的瞬间留在这里。'}</p><button className="button button-outline" onClick={(event) => { event.stopPropagation(); onAddMemory(); }}><Plus size={16} />记录一件事</button></div></article><aside className="home-side-column"><div className="mini-section"><div className="section-heading compact-heading"><h3>接下来一起做 <span>{openPlans.length}</span></h3><button className="icon-button small" title="添加计划" aria-label="添加计划" onClick={onAddPlan}><Plus size={16} /></button></div>{openPlans.slice(0, 3).map((plan) => <PlanRow key={plan.id} plan={plan} onToggle={onTogglePlan} />)}{openPlans.length === 0 && <EmptyState text="还没有待完成的计划。" />}</div><div className="mini-section quote-section"><Sparkles size={17} /><p>把小事也认真记下来。</p><span>— 留给未来的你们</span></div></aside></section>
    <div className="section-heading"><div><span className="eyebrow">FOR LATER / TOGETHER</span><h2>计划中的小事</h2></div><button className="text-button" onClick={() => openView('plans')}>查看全部 <ArrowUpRight size={15} /></button></div>
    <section className="plan-preview-grid">{openPlans.slice(0, 3).map((plan) => <article className="plan-preview" key={plan.id} onClick={() => openView('plans')}><div className="plan-preview-icon"><ListTodo size={18} /></div><div><span className="tag tag-soft">{plan.type}</span><h3>{plan.title}</h3><p>{planSummary(plan)}</p></div></article>)}{openPlans.length === 0 && <EmptyState text="把想去、想看、想一起完成的事放在这里。" />}</section>
  </div>;
}

function TimelineView({ entries, photos, onAddMemory, onAddMilestone, onOpen, onEdit, onDelete }: { entries: TimelineDisplayEntry[]; photos: Photo[]; onAddMemory: () => void; onAddMilestone: () => void; onOpen: (entry: TimelineDisplayEntry) => void; onEdit: (entry: TimelineDisplayEntry) => void; onDelete: (entry: TimelineDisplayEntry) => void }) {
  return <div className="view-stack"><ViewIntro eyebrow="THE STORY SO FAR" title="回忆时间线" description="重要的日子和普通的日子，都在同一条线上像相册页一样留下来。" action={<div className="action-group"><button className="button button-outline" onClick={onAddMilestone}><CalendarDays size={16} />重要日子</button><button className="button button-dark" onClick={onAddMemory}><Plus size={17} />写一条回忆</button></div>} /><div className="timeline">{entries.map((entry, index) => <TimelineItem key={entry.id} entry={entry} photos={photos} index={index} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />)}</div>{entries.length === 0 && <section className="timeline-empty"><div className="timeline-empty-mark"><Sparkles size={22} /></div><div><h3>第一张相册页还空着</h3><p>从一条回忆或一个重要日子开始，慢慢把你们的故事放进来。</p><div className="action-group"><button className="button button-outline" onClick={onAddMilestone}><CalendarDays size={16} />添加重要日子</button><button className="button button-dark" onClick={onAddMemory}><Plus size={16} />写第一条回忆</button></div></div></section>}</div>;
}

function TimelineItem({ entry, photos, index, onOpen, onEdit, onDelete }: { entry: TimelineDisplayEntry; photos: Photo[]; index: number; onOpen: (entry: TimelineDisplayEntry) => void; onEdit: (entry: TimelineDisplayEntry) => void; onDelete: (entry: TimelineDisplayEntry) => void }) {
  const entryPhotos = photos.filter((photo) => entry.photoIds.includes(photo.id) || photo.timelineEntryId === entry.id);
  const cover = entryPhotos[0];
  const isMilestone = entry.type === 'milestone';
  const isSystem = isMilestone && Boolean(entry.systemRole);
  const date = new Date(`${entry.date}T12:00:00`);
  return <article id={`timeline-${entry.id}`} className={`timeline-item ${isMilestone ? 'milestone-item' : ''}`} style={{ '--timeline-index': index } as CSSProperties}><div className="timeline-date"><strong>{date.getDate()}</strong><span>{new Intl.DateTimeFormat('zh-CN', { month: 'short', year: 'numeric' }).format(date)}</span></div><div className="timeline-dot"><span /></div><div className="memory-entry"><div className="memory-page"><button className="timeline-content-button" onClick={() => onOpen(entry)}>{cover ? <div className="memory-cover" style={{ backgroundImage: `url(${cover.src})` }}><span>{entryPhotos.length} 张照片</span></div> : <div className="memory-cover memory-cover-empty"><ImageIcon size={22} /><span>还没有照片</span></div>}<div className="memory-page-copy"><div className="memory-entry-top"><div><span className="item-meta">{isMilestone ? <span className="timeline-kind">重要日子</span> : entry.location ?? '未记录地点'} <span>·</span> {isSystem ? '关系起点' : isMilestone && entry.repeatAnnual ? '每年重复' : '回忆'}</span><h3>{entry.title}</h3></div></div><p>{isMilestone ? entry.note ?? '为这一天留下一点说明。' : entry.body}</p>{!isMilestone && entry.tags.length > 0 && <div className="tag-row">{entry.tags.map((tag) => <span className="tag tag-soft" key={tag}># {tag}</span>)}</div>}{isMilestone && entry.nextOccurrence && <div className="milestone-countdown"><CalendarDays size={14} />下一次 {formatTimelineDate(entry, entry.nextOccurrence)} · 还有 {entry.countdownDays} 天</div>}</div></button></div><div className="entry-actions">{!isSystem && <button className="icon-button subtle" title="编辑" aria-label={`编辑${entry.title}`} onClick={() => onEdit(entry)}><Pencil size={15} /></button>}{!isSystem && <button className="icon-button subtle danger-icon" title="删除" aria-label={`删除${entry.title}`} onClick={() => onDelete(entry)}><Trash2 size={15} /></button>}<button className="icon-button subtle" title="查看详情" aria-label={`查看${entry.title}`} onClick={() => onOpen(entry)}><MoreHorizontal size={16} /></button></div></div></article>;
}

function PhotosView({ photos, uploads, timeline, onUpload, onEdit, onDelete, onClearUpload, onRetry }: { photos: Photo[]; uploads: UploadItem[]; timeline: TimelineDisplayEntry[]; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onEdit: (photo: Photo) => void; onDelete: (photo: Photo) => void; onClearUpload: (id: string) => void; onRetry: (item: UploadItem) => void }) {
  return <div className="view-stack"><ViewIntro eyebrow="THE LITTLE DETAILS" title="照片" description={`${photos.length} 张照片，把普通日子变成一整面墙。`} action={<label className="button button-dark"><Upload size={17} />选择照片<input className="visually-hidden" type="file" accept="image/*" multiple onChange={onUpload} /></label>} />{uploads.length > 0 && <UploadQueue uploads={uploads} onClear={onClearUpload} onRetry={onRetry} />}{photos.length > 0 ? <div className="photo-wall">{photos.map((photo, index) => <article className={`photo-tile tile-${index % 5}`} key={photo.id}><img src={photo.src} alt={photo.caption} /><div className="photo-overlay"><span>{photo.caption}</span><div className="photo-actions"><small>{formatShortDate(photo.date)}</small><button className="photo-action" title="编辑照片" aria-label={`编辑${photo.caption}`} onClick={() => onEdit(photo)}><Pencil size={13} /></button><button className="photo-action" title="删除照片" aria-label={`删除${photo.caption}`} onClick={() => onDelete(photo)}><Trash2 size={13} /></button></div></div></article>)}</div> : <EmptyState text="还没有照片，选几张你们的日常吧。" />}{photos.length > 0 && <p className="view-note"><Camera size={16} /> 支持手机相册和拍照上传，可以多选，单张图片小于 20MB。</p>}{timeline.length === 0 && <span className="visually-hidden">{timeline.length}</span>}</div>;
}

function UploadQueue({ uploads, onClear, onRetry }: { uploads: UploadItem[]; onClear: (id: string) => void; onRetry: (item: UploadItem) => void }) {
  return <section className="upload-queue"><div className="section-heading compact-heading"><h3>上传队列</h3><span className="queue-count">{uploads.filter((item) => item.status === 'done').length}/{uploads.length}</span></div>{uploads.map((item) => <div className="upload-row" key={item.id}><div className="upload-row-copy"><strong>{item.name}</strong><span>{item.status === 'failed' ? item.error : item.status === 'done' ? '已完成' : item.status === 'preparing' ? '正在优化图片' : `正在保存 ${item.progress}%`}</span></div><div className={`upload-progress ${item.status === 'preparing' || item.status === 'uploading' ? 'is-active' : ''}`}><span style={{ width: `${item.progress}%` }} /></div>{item.status === 'failed' ? <button className="text-button" onClick={() => onRetry(item)}>重试</button> : <button className="icon-button small" title="移除上传记录" aria-label="移除上传记录" onClick={() => onClear(item.id)}><X size={14} /></button>}</div>)}</section>;
}

function PlansView({ plans, onAdd, onEdit, onDelete, onToggle, onWriteMemory }: { plans: PlanItem[]; onAdd: () => void; onEdit: (plan: PlanItem) => void; onDelete: (plan: PlanItem) => void; onToggle: (plan: PlanItem) => void; onWriteMemory: (plan: PlanItem) => void }) {
  const active = plans.filter((plan) => plan.status !== '已完成' && plan.status !== '搁置');
  const completed = plans.filter((plan) => plan.status === '已完成');
  const paused = plans.filter((plan) => plan.status === '搁置');
  return <div className="view-stack"><ViewIntro eyebrow="FOR LATER / TOGETHER" title="计划" description="把想去、想看、想买和想一起完成的事，放在同一份清单里。" action={<button className="button button-dark" onClick={onAdd}><Plus size={17} />添加计划</button>} /><section className="task-board"><div className="task-board-head"><div><span className="eyebrow">OPEN PLANS</span><h2>{active.length} 件进行中</h2></div><div className="progress-ring"><span>{Math.round((completed.length / Math.max(plans.length, 1)) * 100)}%</span></div></div><div className="task-list">{active.map((plan) => <PlanRow key={plan.id} plan={plan} large onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}</div>{completed.length > 0 && <><div className="task-divider"><span>已完成</span></div><div className="task-list completed-list">{completed.map((plan) => <PlanRow key={plan.id} plan={plan} large onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onWriteMemory={onWriteMemory} />)}</div></>}{paused.length > 0 && <><div className="task-divider"><span>暂时搁置</span></div><div className="task-list completed-list">{paused.map((plan) => <PlanRow key={plan.id} plan={plan} large onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}</div></>}</section></div>;
}

function PlanRow({ plan, large = false, onToggle, onEdit, onDelete, onWriteMemory }: { plan: PlanItem; large?: boolean; onToggle: (plan: PlanItem) => void; onEdit?: (plan: PlanItem) => void; onDelete?: (plan: PlanItem) => void; onWriteMemory?: (plan: PlanItem) => void }) {
  const done = plan.status === '已完成';
  return <div className={`task-row ${large ? 'large' : ''} ${done ? 'done' : ''}`}><button className="check-button" title={done ? '标记为未完成' : '标记为完成'} aria-label={done ? '标记为未完成' : '标记为完成'} onClick={() => onToggle(plan)}>{done ? <Check size={14} /> : <Circle size={16} />}</button><div className="task-content"><strong>{plan.title}</strong><span>{plan.type} <span>·</span> {plan.assignee}{plan.dueDate && <> <span>·</span> {formatShortDate(plan.dueDate)}</>}</span></div><span className={`priority priority-${plan.priority}`} />{large && <div className="row-actions">{done && onWriteMemory && <button className="text-button small-text" onClick={() => onWriteMemory(plan)}>写成回忆</button>}{onEdit && <button className="icon-button small" title="编辑计划" aria-label={`编辑${plan.title}`} onClick={() => onEdit(plan)}><Pencil size={14} /></button>}{onDelete && <button className="icon-button small danger-icon" title="删除计划" aria-label={`删除${plan.title}`} onClick={() => onDelete(plan)}><Trash2 size={14} /></button>}</div>}</div>;
}

function SettingsView({ data, publicDemo, remoteMode, onReset, onEditStart, onLock }: { data: SpaceData; publicDemo: boolean; remoteMode: boolean; onReset: () => void; onEditStart: () => void; onLock: () => void }) {
  const accessLabel = publicDemo ? '公开演示' : remoteMode ? '共享空间' : '本地演示';
  const accessDescription = publicDemo ? '当前为空间公开演示模式，请不要上传真实隐私照片。' : remoteMode ? '当前使用 Supabase 共享模式，正式私密空间应启用成员认证。' : '当前内容保存在这个浏览器中，数据不会自动同步到其他设备。';
  const dangerEyebrow = publicDemo ? 'PUBLIC DEMO' : remoteMode ? 'SHARED SPACE' : 'LOCAL DEMO';
  return <div className="view-stack"><ViewIntro eyebrow="SPACE SETTINGS" title="设置" description="这里管理你们的空间偏好。重要日期会按设定时区计算。" /><section className="settings-list"><div className="settings-item"><div className="settings-icon"><Heart size={18} /></div><div><strong>空间名称</strong><span>{data.spaceName} · 两个人共同编辑</span></div><ChevronRight size={18} className="muted-icon" /></div><button className="settings-item settings-item-button" onClick={onEditStart}><div className="settings-icon"><CalendarDays size={18} /></div><div><strong>恋爱开始日</strong><span>{data.relationshipStart ? `${formatDate(data.relationshipStart, { year: 'numeric', month: 'long', day: 'numeric' })} · ${data.timezone}` : '尚未设置，设置后会开始显示恋爱时长'}</span></div><span className="settings-badge">编辑</span></button><div className="settings-item"><div className="settings-icon"><LockKeyhole size={18} /></div><div><strong>访问安全</strong><span>{accessDescription}</span></div><span className="settings-badge">{accessLabel}</span></div></section><section className="settings-danger"><div><span className="eyebrow">{dangerEyebrow}</span><h3>清空空间</h3><p>清空后不会恢复任何示例数据。</p></div><div className="settings-actions"><button className="button button-danger" onClick={onReset}><Trash2 size={16} />清空内容</button><button className="button button-outline" onClick={onLock}><LockKeyhole size={16} />锁定空间</button></div></section></div>;
}

function TimelineDetailSheet({ entry, photos, onClose, onEdit, onDelete }: { entry: TimelineDisplayEntry; photos: Photo[]; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const entryPhotos = photos.filter((photo) => entry.photoIds.includes(photo.id) || photo.timelineEntryId === entry.id);
  const isSystem = entry.type === 'milestone' && Boolean(entry.systemRole);
  return <Sheet title={entry.type === 'milestone' ? '重要日子' : '回忆详情'} eyebrow={entry.type === 'milestone' ? 'MILESTONE' : 'MEMORY'} onClose={onClose}><div className="detail-meta"><span>{formatTimelineDate(entry, entry.date)}</span>{entry.location && <><span>·</span><span><MapPin size={13} />{entry.location}</span></>}</div><h2 className="detail-title">{entry.title}</h2><p className="detail-body">{entry.type === 'milestone' ? entry.note ?? '为这一天留下一点说明。' : entry.body}</p>{entry.type === 'milestone' && entry.nextOccurrence && <div className="detail-highlight"><CalendarDays size={17} /><div><strong>{entry.repeatAnnual ? '下一次纪念日' : '日期倒计时'}</strong><span>{formatTimelineDate(entry, entry.nextOccurrence)} · 还有 {entry.countdownDays} 天</span></div></div>}{entry.type === 'memory' && entry.tags.length > 0 && <div className="tag-row">{entry.tags.map((tag) => <span className="tag tag-soft" key={tag}># {tag}</span>)}</div>}{entryPhotos.length > 0 && <div className="detail-photo-grid">{entryPhotos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.caption} />)}</div>}<div className="form-actions">{!isSystem && <button className="button button-outline" onClick={onEdit}><Pencil size={16} />编辑</button>}{!isSystem && <button className="button button-danger" onClick={onDelete}><Trash2 size={16} />删除</button>}{isSystem && <span className="view-note">恋爱开始日由空间设置管理</span>}</div></Sheet>;
}

function RelationshipSettingsForm({ relationshipStart, onClose, onSubmit }: { relationshipStart: string | null; onClose: () => void; onSubmit: (relationshipStart: string | null) => void }) {
  const [date, setDate] = useState(relationshipStart ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(date || null);
  }
  return <Sheet title="设置恋爱开始日" eyebrow="RELATIONSHIP START" onClose={onClose}><form className="modal-form" onSubmit={submit}><p className="form-description">这一天会成为你们时间线的起点，也会用于计算首页的恋爱时长。</p><label>开始日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><FormActions onClose={onClose} submitLabel="保存开始日" /></form></Sheet>;
}

function MemoryForm({ entry, draft, onClose, onSubmit }: { entry?: MemoryEntry; draft?: MemoryEntry; onClose: () => void; onSubmit: (memory: MemoryEntry) => void }) {
  const initial = entry ?? draft;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayString());
  const [location, setLocation] = useState(initial?.location ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date || !body.trim()) return;
    onSubmit({ id: entry?.id ?? newId('memory'), type: 'memory', title: title.trim(), date, location: location.trim(), body: body.trim(), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), photoIds: entry?.photoIds ?? [], createdAt: entry?.createdAt ?? new Date().toISOString() });
  }
  return <Sheet title={entry ? '编辑回忆' : '记录一条回忆'} eyebrow={entry ? 'EDIT MEMORY' : 'NEW MEMORY'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一次一起看海" required /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>地点<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="可以留空" /></label></div><label>写下这一刻<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="发生了什么？你记得什么？" rows={5} required /></label><label>标签<span className="label-hint">用逗号分开</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="旅行, 晴天" /></label><FormActions onClose={onClose} submitLabel="保存回忆" /></form></Sheet>;
}

function MilestoneForm({ entry, onClose, onSubmit }: { entry?: MilestoneEntry; onClose: () => void; onSubmit: (milestone: MilestoneEntry) => void }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [date, setDate] = useState(entry?.date ?? '');
  const [repeatAnnual, setRepeatAnnual] = useState(entry?.repeatAnnual ?? true);
  const [time, setTime] = useState(entry?.time ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    onSubmit({ id: entry?.id ?? newId('milestone'), type: 'milestone', title: title.trim(), date, kind: repeatAnnual ? 'anniversary' : 'one-off', repeatAnnual, time: time || undefined, location: location.trim() || undefined, note: note.trim() || undefined, photoIds: entry?.photoIds ?? [], createdAt: entry?.createdAt ?? new Date().toISOString() });
  }
  return <Sheet title={entry ? '编辑重要日子' : '添加重要日子'} eyebrow={entry ? 'EDIT MILESTONE' : 'NEW MILESTONE'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一次见面的日子" required /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>时间<span className="label-hint">可选</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div><div className="segmented-control"><button type="button" className={repeatAnnual ? 'selected' : ''} onClick={() => setRepeatAnnual(true)}>每年重复</button><button type="button" className={!repeatAnnual ? 'selected' : ''} onClick={() => setRepeatAnnual(false)}>一次性</button></div><label>地点<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：赤柱" /></label><label>说明<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="想为这一天留下什么？" rows={4} /></label><FormActions onClose={onClose} submitLabel="保存日期" /></form></Sheet>;
}

function PlanForm({ plan, onClose, onSubmit }: { plan?: PlanItem; onClose: () => void; onSubmit: (plan: PlanItem) => void }) {
  const [title, setTitle] = useState(plan?.title ?? '');
  const [type, setType] = useState<PlanType>(plan?.type ?? '生活');
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? '想法');
  const [dueDate, setDueDate] = useState(plan?.dueDate ?? '');
  const [location, setLocation] = useState(plan?.location ?? '');
  const [link, setLink] = useState(plan?.link ?? '');
  const [note, setNote] = useState(plan?.note ?? '');
  const [priority, setPriority] = useState<PlanItem['priority']>(plan?.priority ?? 'medium');
  const [assignee, setAssignee] = useState<PlanItem['assignee']>(plan?.assignee ?? '一起');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({ id: plan?.id ?? newId('plan'), title: title.trim(), type, status, dueDate: dueDate || undefined, location: location.trim() || undefined, link: link.trim() || undefined, note: note.trim() || undefined, priority, assignee, completedAt: plan?.completedAt });
  }
  return <Sheet title={plan ? '编辑计划' : '添加计划'} eyebrow={plan ? 'EDIT PLAN' : 'NEW PLAN'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>计划内容<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：找一个周末去看日落" required /></label><div className="form-grid"><label>类型<select value={type} onChange={(event) => setType(event.target.value as PlanType)}><option>地点</option><option>餐厅</option><option>电影</option><option>礼物</option><option>生活</option><option>纪念日</option><option>其他</option></select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as PlanStatus)}><option>想法</option><option>计划中</option><option>已完成</option><option>搁置</option></select></label></div><div className="form-grid"><label>日期<span className="label-hint">可选</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><label>负责人<select value={assignee} onChange={(event) => setAssignee(event.target.value as PlanItem['assignee'])}><option>一起</option><option>我</option><option>你</option></select></label></div><label>地点<span className="label-hint">可选</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：长洲岛" /></label><label>链接<span className="label-hint">可选</span><div className="input-with-icon"><Link2 size={16} /><input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." /></div></label><label>备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="为什么想一起做？" rows={4} /></label><div className="form-grid"><label>优先级<select value={priority} onChange={(event) => setPriority(event.target.value as PlanItem['priority'])}><option value="low">不着急</option><option value="medium">普通</option><option value="high">重要</option></select></label><div /></div><FormActions onClose={onClose} submitLabel="保存计划" /></form></Sheet>;
}

function PhotoForm({ photo, timeline, onClose, onSubmit }: { photo: Photo; timeline: TimelineDisplayEntry[]; onClose: () => void; onSubmit: (photo: Photo) => void }) {
  const [caption, setCaption] = useState(photo.caption);
  const [date, setDate] = useState(photo.date);
  const [timelineEntryId, setTimelineEntryId] = useState(photo.timelineEntryId ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ ...photo, caption: caption.trim() || '未命名照片', date, timelineEntryId: timelineEntryId || undefined });
  }
  return <Sheet title="编辑照片" eyebrow="EDIT PHOTO" onClose={onClose}><div className="photo-edit-preview"><img src={photo.src} alt={photo.caption} /></div><form className="modal-form" onSubmit={submit}><label>说明<input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="这张照片记得什么？" /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>关联时间线<select value={timelineEntryId} onChange={(event) => setTimelineEntryId(event.target.value)}><option value="">独立照片</option>{timeline.filter((entry) => entry.type === 'memory' || entry.type === 'milestone').map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label></div><FormActions onClose={onClose} submitLabel="保存照片" /></form></Sheet>;
}

function Sheet({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" aria-hidden="true" /><div className="modal-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" title="关闭" aria-label="关闭" onClick={onClose}><X size={19} /></button></div>{children}</section></div>;
}

function FormActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return <div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose}>取消</button><button type="submit" className="button button-dark"><Check size={16} />{submitLabel}</button></div>;
}

function ViewIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="view-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="view-intro-action">{action}</div>}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><Sparkles size={18} /><span>{text}</span></div>;
}

export default App;
