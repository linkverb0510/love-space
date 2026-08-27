import { ChangeEvent, CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  CheckSquare,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  Film,
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
  Play,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { createMemoryDraftFromPlan, getNextMilestone, getTimelineEntries, groupPhotosByDate } from './lib/domain';
import { getDateInTimezone, getRelationshipDuration, SPACE_TIMEZONE } from './lib/dates';
import { readRelationshipStart } from './lib/editing';
import { inferPhotoDate, pairPhotoFiles, preparePhotoAssets, validateMediaFile } from './lib/media';
import { deleteLocalAssets, hydrateLocalPhotoSources, revokeLocalPhotoSources } from './lib/local-media';
import { createSpaceRepository } from './lib/repository';
import { signInWithSharedPassword, restoreAuthSession, signOut as signOutAuth } from './lib/auth';
import { ConflictError } from './lib/errors';
import { getRuntimeConfig, type RuntimeConfig } from './lib/runtime-config';
import { createSupabaseClient } from './lib/supabase';
import { isPrivateSpaceEntry } from './lib/runtime-path';
import { getActiveRole, getRoleLabel, saveActiveRole, type ActiveRole } from './lib/roles';
import { getPublicAssetPath } from './lib/public-asset-path';
import { fetchAvatarUrls, type AvatarUrls } from './lib/avatars';
import { LolitaPageDecor, LolitaPaperDecor, MaterialSticker } from './components/LolitaDecor';
import { MASCOT_ASSETS, MATERIAL_ASSETS } from './lib/visual-assets';
import { FilmStripDivider, PolaroidFrame, Postmark, StampFrame, StickyNote, StitchLine, TicketStub, WashiTape } from './components/scrapbook';
import { itemFallIntoPlace, springSnappy, stackStagger, viewFadeRise } from './lib/motion-presets';
import {
  EMPTY_SPACE_DATA,
  loadSpaceData,
  resetSpaceData
} from './lib/storage';
import type {
  MemoryEntry,
  MilestoneEntry,
  Photo,
  PhotoAssetVariant,
  PlanItem,
  PlanStatus,
  PlanType,
  SpaceData,
  TimelineDisplayEntry,
  TimelineEntry,
  ViewKey,
  SpaceRole
} from './types';
import type { Session } from '@supabase/supabase-js';

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
  | { type: 'photo-detail'; photo: Photo }
  | { type: 'photo-form'; photo: Photo }
  | { type: 'settings-form' }
  | null;

type UploadItem = {
  id: string;
  name: string;
  file: File;
  motion?: File;
  status: 'preparing' | 'uploading' | 'done' | 'failed';
  stage: '等待处理' | '生成展示版' | '保存媒体' | '已完成' | '失败';
  error?: string;
  retryable?: boolean;
  timelineEntryId?: string;
  fallbackDate?: string;
  createdByRole?: SpaceRole;
};

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function todayString(timezone = SPACE_TIMEZONE): string {
  return getDateInTimezone(new Date(), timezone);
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
  const config = useMemo(() => getRuntimeConfig(), []);
  const privateMode = isPrivateSpaceEntry();
  const privateConfig = useMemo(() => ({
    ...config,
    dataMode: 'supabase' as const,
    publicDemo: false,
    spacePath: config.privateSpacePath
  }), [config]);
  const supabaseClient = useMemo(() => privateMode ? createSupabaseClient(privateConfig) : null, [privateConfig, privateMode]);
  const [session, setSession] = useState<Session | null | undefined>(() => privateMode ? undefined : null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!privateMode || !supabaseClient) return;
    restoreAuthSession(supabaseClient).then(setSession).catch((error) => {
      setAuthError(error instanceof Error ? error.message : '无法恢复登录状态。');
      setSession(null);
    });
  }, [privateMode, supabaseClient]);

  if (!privateMode) {
    return <SpaceApp config={{ ...config, dataMode: 'local', publicDemo: false, spacePath: 'local-development' }} readOnly={!import.meta.env.DEV} onLock={() => undefined} />;
  }
  if (!supabaseClient) return <AccessError text="私密空间尚未配置 Supabase，请先完成部署环境设置。" />;
  if (authError) return <AccessError text={authError} />;
  if (session === undefined) return <LoadingScreen text="正在检查私密空间…" />;
  if (!session) return <AccessGate client={supabaseClient} email={privateConfig.sharedAuthEmail} onEnter={setSession} />;

  return <SpaceApp config={privateConfig} onLock={async () => { await signOutAuth(supabaseClient); setSession(null); }} />;
}

function AccessGate({ client, email, onEnter }: { client: NonNullable<ReturnType<typeof createSupabaseClient>>; email: string; onEnter: (session: Session) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setError('');
    try {
      const session = await signInWithSharedPassword(client, email, password);
      onEnter(session);
    } catch (authFailure) {
      setError(authFailure instanceof Error ? authFailure.message : '密码不正确，请重新输入。');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="access-screen">
      <div className="access-art" aria-hidden="true">
        <span className="access-stamp">two of us</span>
        <div className="access-envelope">
          <div className="access-envelope-card">
            <WashiTape tone="pink" to="left" />
            <WashiTape tone="blue" to="right" />
            <StampFrame className="access-seal">
              <MascotDuo />
            </StampFrame>
            <div className="access-doodles">
              <MaterialSticker asset={MATERIAL_ASSETS.ribbon} placement="doodle-a" tone="rose" size="sm" />
              <MaterialSticker asset={MATERIAL_ASSETS.strawberry} placement="doodle-b" tone="berry" size="sm" />
            </div>
          </div>
        </div>
        <span className="access-note">keep the little things</span>
      </div>
      <section className="access-panel">
        <WashiTape tone="gold" to="center" className="tape-top" />
        <div className="brand-lockup"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>our little space</span></div>
        <div className="eyebrow">PRIVATE SPACE / AUTH</div>
        <h1>只属于你们的<br /><em>小小空间</em></h1>
        <StitchLine />
        <p className="access-copy">把重要的日子、照片和还想一起完成的事，放在一个只属于你们的地方。</p>
        <form className="access-form" onSubmit={submit}>
          <label htmlFor="space-password">共同密码</label>
          <input className="visually-hidden" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" value="our-little-space" readOnly />
          <div className="input-with-icon"><KeyRound size={18} /><input id="space-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="输入你们的密码" autoComplete="new-password" autoFocus /></div>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-dark button-wide" type="submit" disabled={checking}><LockKeyhole size={17} />{checking ? '验证中…' : '拆开这封信'}</button>
        </form>
        <p className="access-footnote"><LockKeyhole size={14} /> 共同密码由私密空间的 Auth 服务验证。</p>
      </section>
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return <main className="access-screen"><section className="access-panel loading-panel"><MascotDuo compact /><div className="brand-lockup"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>our little space</span></div><div className="eyebrow">LOADING</div><h1>{text}</h1></section></main>;
}

/** 双人吉祥物:SVG 预加载成功才显示,否则回退到爱心(避免破图)。 */
function MascotDuo({ compact = false }: { compact?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const images = [MASCOT_ASSETS.l.src, MASCOT_ASSETS.w.src].map((src) => new Image());
    Promise.all(images.map((image) => new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    }))).then((results) => {
      if (!cancelled) setReady(results.every(Boolean));
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <span className={`mascot-duo ${compact ? 'mascot-duo-compact' : ''}`} data-ready={ready} aria-hidden="true">
      {ready ? (
        <>
          <img src={MASCOT_ASSETS.l.src} alt="" />
          <img src={MASCOT_ASSETS.w.src} alt="" />
        </>
      ) : (
        <span className="access-heart mascot-heart"><Heart size={compact ? 30 : 46} fill="currentColor" strokeWidth={1.2} /></span>
      )}
    </span>
  );
}

/** 角色形象兜底链:真人头像 → 吉祥物 → 字母徽章。 */
function RolePortrait({ role, urls }: { role: SpaceRole; urls: AvatarUrls }) {
  const [mascotFailed, setMascotFailed] = useState(false);
  const url = role === 'l' ? urls.l : role === 'w' ? urls.w : undefined;
  const mascot = role === 'l' || role === 'w' ? MASCOT_ASSETS[role] : undefined;
  if (url) return <img className="portrait-img" src={url} alt={getRoleLabel(role)} />;
  if (mascot && !mascotFailed) return <img className="portrait-img portrait-mascot" src={mascot.src} alt="" aria-hidden="true" onError={() => setMascotFailed(true)} />;
  return <span className={`role-avatar role-${role}`}>{getRoleLabel(role)}</span>;
}

function AccessError({ text }: { text: string }) {
  return <main className="access-screen"><section className="access-panel loading-panel"><div className="brand-lockup"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><span>our little space</span></div><div className="eyebrow">CONFIGURATION ERROR</div><h1>暂时无法进入</h1><p className="access-copy">{text}</p></section></main>;
}

type SyncStatus = 'loading' | 'saving' | 'clean' | 'conflict' | 'error';

function replaceTimeline(data: SpaceData, entry: TimelineEntry): SpaceData {
  const exists = data.timeline.some((item) => item.id === entry.id);
  return { ...data, timeline: exists ? data.timeline.map((item) => item.id === entry.id ? entry : item) : [entry, ...data.timeline] };
}

function replacePlan(data: SpaceData, plan: PlanItem): SpaceData {
  const exists = data.plans.some((item) => item.id === plan.id);
  return { ...data, plans: exists ? data.plans.map((item) => item.id === plan.id ? plan : item) : [plan, ...data.plans] };
}

function replacePhoto(data: SpaceData, photo: Photo): SpaceData {
  const exists = data.photos.some((item) => item.id === photo.id);
  return { ...data, photos: exists ? data.photos.map((item) => item.id === photo.id ? photo : item) : [photo, ...data.photos] };
}

function SyncStatusBadge({ status, remoteMode, readOnly }: { status: SyncStatus; remoteMode: boolean; readOnly: boolean }) {
  const label = readOnly ? '公开预览 · 只读' : status === 'loading' ? '加载中' : status === 'saving' ? '正在保存' : status === 'conflict' ? '存在冲突' : status === 'error' ? '保存失败' : remoteMode ? '已同步' : '本地已保存';
  return <span className={`sync-status sync-${status}`}><span className="status-dot" />{label}</span>;
}

function SpaceApp({ config, onLock, readOnly = false }: { config: RuntimeConfig; onLock: () => void | Promise<void>; readOnly?: boolean }) {
  const repository = useMemo(() => createSpaceRepository(config), [config]);
  const remoteMode = !readOnly && config.dataMode === 'supabase' && Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const [data, setData] = useState<SpaceData>(() => remoteMode ? { ...EMPTY_SPACE_DATA, timeline: [], photos: [], plans: [] } : readOnly ? EMPTY_SPACE_DATA : loadSpaceData());
  const [dataReady, setDataReady] = useState(!remoteMode);
  const [view, setView] = useState<ViewKey>('home');
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState('');
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [activeRole, setActiveRole] = useState<ActiveRole>(() => getActiveRole(config.spacePath));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(remoteMode ? 'loading' : 'clean');
  const avatarClient = useMemo(() => remoteMode ? createSupabaseClient(config) : null, [remoteMode, config]);
  const [avatarUrls, setAvatarUrls] = useState<AvatarUrls>({});
  useEffect(() => {
    if (!avatarClient) return;
    let cancelled = false;
    fetchAvatarUrls(avatarClient, config.spacePath).then((urls) => {
      if (!cancelled) setAvatarUrls(urls);
    }).catch(() => { /* 头像未上传或网络失败:回退到吉祥物/字母 */ });
    return () => { cancelled = true; };
  }, [avatarClient, config.spacePath]);
  const activeSheet = useRef<SheetState>(null);
  const pendingUploads = useRef<UploadItem[]>([]);
  const activeUploadCount = useRef(0);
  const entryFocusPending = useRef(false);

  useEffect(() => {
    // CSS cannot read Vite's base path, so expose the resolved public URL at runtime.
    const root = document.documentElement;
    root.style.setProperty('--cotton-lining-image', `url("${getPublicAssetPath('assets/materials/cotton-jersey-diffuse-cc0.jpg')}")`);
    return () => { root.style.removeProperty('--cotton-lining-image'); };
  }, []);

  useEffect(() => { activeSheet.current = sheet; }, [sheet]);
  useEffect(() => { saveActiveRole(config.spacePath, activeRole); }, [activeRole, config.spacePath]);

  useEffect(() => {
    if (!remoteMode) return;
    let cancelled = false;
    repository.load().then((loadedData) => {
      if (cancelled) return;
      setData(loadedData);
      setDataReady(true);
      setSyncStatus('clean');
    }).catch(() => {
      if (cancelled) return;
      setSyncStatus('error');
      setToast('共享空间读取失败，请检查 Supabase 配置。');
    });
    return () => { cancelled = true; };
  }, [remoteMode, repository]);
  useEffect(() => {
    if (!remoteMode || !repository.subscribe) return;
    return repository.subscribe((loadedData) => {
      if (activeSheet.current) return;
      setData(loadedData);
      setDataReady(true);
      setSyncStatus('clean');
    });
  }, [remoteMode, repository]);
  useEffect(() => {
    if (remoteMode || readOnly) return;
    let cancelled = false;
    hydrateLocalPhotoSources(data.photos).then((photos) => {
      if (cancelled || photos.every((photo, index) => photo.src === data.photos[index]?.src)) return;
      setData((current) => ({ ...current, photos }));
    }).catch(() => setToast('本地照片读取失败，请重试。'));
    return () => { cancelled = true; };
  }, [remoteMode, readOnly]);
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
      entryFocusPending.current = false;
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [view, focusEntryId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { if (!entryFocusPending.current) window.scrollTo({ top: 0 }); }, 60);
    return () => window.clearTimeout(timeout);
  }, [view]);

  function updateData(updater: (current: SpaceData) => SpaceData, message?: string) {
    setData((current) => updater(current));
    if (message) setToast(message);
  }

  function openView(nextView: ViewKey, entryId?: string) {
    setView(nextView);
    if (entryId) {
      entryFocusPending.current = true;
      setFocusEntryId(entryId);
    }
  }

  function canWrite(): boolean {
    if (readOnly) {
      setToast('公开预览是只读的，私密修改请打开 ?space=private。');
      return false;
    }
    if (!dataReady) {
      setToast('共享空间正在加载，请稍后再编辑。');
      return false;
    }
    return true;
  }

  function handleFailure(error: unknown): void {
    if (error instanceof ConflictError) {
      setSyncStatus('conflict');
      setToast(error.message);
      return;
    }
    setSyncStatus('error');
    setToast(error instanceof Error ? error.message : '保存失败，请稍后重试。');
  }

  async function saveMutation<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (!canWrite()) return undefined;
    setSyncStatus('saving');
    try {
      const result = await operation();
      setSyncStatus('clean');
      return result;
    } catch (error) {
      handleFailure(error);
      return undefined;
    }
  }

  async function saveTimelineEntry(entry: TimelineEntry, attachments: File[] = []) {
    const preparedEntry = { ...entry, createdByRole: entry.createdByRole ?? activeRole } as TimelineEntry;
    const saved = await saveMutation(() => repository.saveTimelineEntry(preparedEntry));
    if (!saved) return;
    updateData((current) => replaceTimeline(current, saved), saved.type === 'memory' ? '回忆已经放进时间线。' : '重要日子已经记下了。');
    setSheet(null);
    if (attachments.length > 0) queuePhotoFiles(attachments, { timelineEntryId: saved.id, fallbackDate: saved.date, createdByRole: saved.createdByRole });
  }

  async function deleteTimelineEntry(entry: TimelineDisplayEntry) {
    if (entry.type === 'milestone' && entry.systemRole) {
      setToast('恋爱开始日请在设置中修改，不能从时间线删除。');
      return;
    }
    if (!window.confirm(`确定删除“${entry.title}”吗？照片不会被删除。`)) return;
    const deleted = await saveMutation(async () => {
      await repository.deleteTimelineEntry(entry.id, entry.version ?? 1);
      return true;
    });
    if (!deleted) return;
    updateData((current) => ({
      ...current,
      timeline: current.timeline.filter((item) => item.id !== entry.id),
      photos: current.photos.map((photo) => photo.timelineEntryId === entry.id ? { ...photo, timelineEntryId: undefined } : photo)
    }), '这条内容已经移除。');
    setSheet(null);
  }

  async function savePlan(plan: PlanItem) {
    const withRole = plan.createdByRole ? plan : { ...plan, createdByRole: activeRole };
    const normalized = withRole.status === '已完成' && !withRole.completedAt ? { ...withRole, completedAt: todayString(data.timezone) } : withRole.status !== '已完成' ? { ...withRole, completedAt: undefined } : withRole;
    const saved = await saveMutation(() => repository.savePlan(normalized));
    if (!saved) return;
    updateData((current) => replacePlan(current, saved), '计划已经更新。');
    setSheet(null);
  }

  async function deletePlan(plan: PlanItem) {
    if (!window.confirm(`确定删除“${plan.title}”吗？`)) return;
    const deleted = await saveMutation(async () => {
      await repository.deletePlan(plan.id, plan.version ?? 1);
      return true;
    });
    if (!deleted) return;
    updateData((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== plan.id) }), '计划已经移除。');
  }

  async function savePhoto(photo: Photo) {
    const saved = await saveMutation(() => repository.updatePhoto(photo));
    if (!saved) return;
    updateData((current) => replacePhoto(current, saved), '照片信息已经更新。');
    setSheet(null);
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`确定删除“${photo.caption}”吗？`)) return;
    const deleted = await saveMutation(async () => {
      await repository.deletePhoto(photo, photo.version ?? 1);
      return true;
    });
    if (!deleted) return;
    revokeLocalPhotoSources(photo);
    if (photo.assetKey || photo.thumbnailAssetKey || photo.originalAssetKey || photo.motionAssetKey) {
      void deleteLocalAssets([photo.assetKey, photo.thumbnailAssetKey, photo.originalAssetKey, photo.motionAssetKey].filter((key): key is string => Boolean(key)));
    }
    updateData((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== photo.id)
    }), '照片已经删除。');
    setSheet(null);
  }

  async function startUpload(item: UploadItem) {
    if (!canWrite()) {
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'failed', error: '公开预览为只读模式' } : upload));
      return;
    }
    try {
      setSyncStatus('saving');
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'preparing', stage: '生成展示版' } : upload));
      const photoId = newId('photo');
      const photoDate = await inferPhotoDate(item.file, item.fallbackDate ?? todayString(data.timezone));
      const assets = await preparePhotoAssets(item.file, item.motion);
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'uploading', stage: '保存媒体' } : upload));
      const photo = await repository.uploadPhoto(assets, { id: photoId, caption: item.name, date: photoDate, timelineEntryId: item.timelineEntryId, createdByRole: item.createdByRole ?? activeRole });
      updateData((current) => ({ ...current, photos: [photo, ...current.photos] }));
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'done', stage: '已完成' } : upload));
      setSyncStatus('clean');
      setToast('照片已经加入照片墙。');
    } catch (error) {
      handleFailure(error);
      setUploads((current) => current.map((upload) => upload.id === item.id ? { ...upload, status: 'failed', stage: '失败', error: error instanceof Error ? error.message : '读取失败' } : upload));
    }
  }

  function drainUploadQueue() {
    while (activeUploadCount.current < 2 && pendingUploads.current.length > 0) {
      const item = pendingUploads.current.shift();
      if (!item) return;
      activeUploadCount.current += 1;
      void startUpload(item).finally(() => {
        activeUploadCount.current -= 1;
        drainUploadQueue();
      });
    }
  }

  function enqueueUploads(items: UploadItem[]) {
    pendingUploads.current.push(...items);
    drainUploadQueue();
  }

  function queuePhotoFiles(files: File[], options: Pick<UploadItem, 'timelineEntryId' | 'fallbackDate' | 'createdByRole'> = {}) {
    const items: UploadItem[] = [];
    pairPhotoFiles(files).forEach((pair) => {
      if (!pair.image) {
        if (pair.motion) items.push({
          id: newId('upload'),
          name: pair.motion.name,
          file: pair.motion,
          status: 'failed',
          stage: '失败',
          error: '找不到同名照片，未保存动态片段。',
          retryable: false,
          ...options
        });
        setToast(`${pair.motion?.name ?? pair.stem}：请同时选择同名照片作为动态封面。`);
        return;
      }
      const validationError = validateMediaFile(pair.image) ?? (pair.motion ? validateMediaFile(pair.motion) : undefined);
      if (validationError) {
        setToast(`${pair.image.name}：${validationError}`);
        return;
      }
      items.push({
        id: newId('upload'),
        name: pair.motion ? `${pair.image.name} · ${pair.motion.name}` : pair.image.name,
        file: pair.image,
        motion: pair.motion,
        status: 'preparing',
        stage: '等待处理',
        retryable: true,
        ...options
      });
    });
    setUploads((current) => [...items, ...current]);
    enqueueUploads(items.filter((item) => item.status !== 'failed'));
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    if (!canWrite()) {
      event.target.value = '';
      return;
    }
    queuePhotoFiles(Array.from(event.target.files ?? []), { createdByRole: activeRole });
    event.target.value = '';
  }

  function retryUpload(item: UploadItem) {
    if (item.retryable === false) return;
    const retry = { ...item, status: 'preparing' as const, stage: '等待处理' as const, error: undefined };
    setUploads((current) => current.map((upload) => upload.id === item.id ? retry : upload));
    enqueueUploads([retry]);
  }

  async function resetSpace() {
    if (!canWrite()) return;
    if (!window.confirm('要清空这个空间吗？当前内容会被移除。')) return;
    setSyncStatus('saving');
    try {
      if (!remoteMode) {
        data.photos.forEach((photo) => {
          revokeLocalPhotoSources(photo);
          void deleteLocalAssets([photo.assetKey, photo.thumbnailAssetKey, photo.originalAssetKey, photo.motionAssetKey].filter((key): key is string => Boolean(key)));
        });
        setData(resetSpaceData());
      } else {
        for (const photo of data.photos) await repository.deletePhoto(photo, photo.version ?? 1);
        for (const entry of data.timeline) await repository.deleteTimelineEntry(entry.id, entry.version ?? 1);
        for (const plan of data.plans) await repository.deletePlan(plan.id, plan.version ?? 1);
        const settings = await repository.saveSettings({ ...EMPTY_SPACE_DATA, version: data.version }, data.version);
        setData({ ...EMPTY_SPACE_DATA, ...settings, timeline: [], photos: [], plans: [] });
      }
      setSyncStatus('clean');
      setToast('空间已经清空。');
    } catch (error) {
      handleFailure(error);
    }
  }

  async function saveRelationshipStart(relationshipStart: string | null) {
    const saved = await saveMutation(() => repository.saveSettings({
      spaceName: data.spaceName,
      relationshipStart,
      timezone: SPACE_TIMEZONE
    }, data.version));
    if (!saved) return;
    updateData((current) => ({ ...current, ...saved, timezone: SPACE_TIMEZONE }), '开始日期已经更新。');
    setSheet(null);
  }

  const recentEntry = timeline.find((entry) => entry.type === 'memory') ?? timeline[0];
  const recentPhoto = recentEntry ? data.photos.find((photo) => photo.timelineEntryId === recentEntry.id) ?? data.photos[0] : data.photos[0];
  const editingReady = !readOnly && dataReady;
  const lolitaSurface = view === 'timeline' ? 'timeline' : view === 'photos' ? 'photos' : 'home';

  const activeSheetNode = sheet?.type === 'timeline-detail' ? { key: 'sheet-timeline-detail', node: <TimelineDetailSheet entry={sheet.entry} photos={data.photos} readOnly={readOnly} disabled={!editingReady} onClose={() => setSheet(null)} onEdit={() => setSheet(sheet.entry.type === 'memory' ? { type: 'memory-form', entry: sheet.entry } : { type: 'milestone-form', entry: sheet.entry })} onDelete={() => void deleteTimelineEntry(sheet.entry)} /> } : sheet?.type === 'memory-form' ? { key: 'sheet-memory-form', node: <MemoryForm entry={sheet.entry} draft={sheet.draft} activeRole={activeRole} onClose={() => setSheet(null)} onSubmit={(memory, attachments) => void saveTimelineEntry(memory, attachments)} /> } : sheet?.type === 'milestone-form' ? { key: 'sheet-milestone-form', node: <MilestoneForm entry={sheet.entry} activeRole={activeRole} onClose={() => setSheet(null)} onSubmit={saveTimelineEntry} /> } : sheet?.type === 'plan-form' ? { key: 'sheet-plan-form', node: <PlanForm plan={sheet.plan} activeRole={activeRole} onClose={() => setSheet(null)} onSubmit={savePlan} /> } : sheet?.type === 'photo-detail' ? { key: 'sheet-photo-detail', node: <PhotoDetailSheet photo={sheet.photo} timeline={timeline} readOnly={readOnly} disabled={!editingReady} onClose={() => setSheet(null)} onEdit={() => setSheet({ type: 'photo-form', photo: sheet.photo })} onDelete={() => void deletePhoto(sheet.photo)} onOpenTimeline={(entryId) => { setSheet(null); openView('timeline', entryId); }} getAsset={(photo, variant) => repository.getPhotoAssetUrl(photo, variant)} /> } : sheet?.type === 'photo-form' ? { key: 'sheet-photo-form', node: <PhotoForm photo={sheet.photo} timeline={timeline} onClose={() => setSheet(null)} onSubmit={savePhoto} /> } : sheet?.type === 'settings-form' ? { key: 'sheet-settings-form', node: <RelationshipSettingsForm relationshipStart={data.relationshipStart} onClose={() => setSheet(null)} onSubmit={saveRelationshipStart} /> } : null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-shell">
      <MaterialSticker asset={MATERIAL_ASSETS.ribbon} tone="rose" placement="notebook-bow" className="notebook-bow" />
       <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark"><Heart size={17} fill="currentColor" /></span><div><strong>our little space</strong><small>just us, in one place</small></div></div>
         <div className="space-card"><div className="space-card-top"><span className="status-dot" />{readOnly ? '公开预览' : config.publicDemo ? '公开演示' : remoteMode ? '共享空间' : '本地空间'}</div><strong>{data.spaceName}</strong><span>{readOnly || config.publicDemo ? '请勿放入隐私照片' : '两个人共同编辑'}</span></div>
        <nav className="desktop-nav" aria-label="主要导航">{navItems.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
         <div className="sidebar-bottom">{!readOnly && <button className="quiet-button" onClick={onLock}><LockKeyhole size={17} />锁定空间</button>}</div>
      </aside>
      <main className="main-content">
         <header className="topbar"><div><span className="mobile-kicker">OUR LITTLE SPACE</span><h2>{pageTitle}</h2></div><div className="topbar-actions"><SyncStatusBadge status={readOnly ? 'clean' : syncStatus} remoteMode={remoteMode} readOnly={readOnly} /><button className={`avatar-button role-${activeRole}`} title={`当前身份 ${getRoleLabel(activeRole)}，打开设置`} aria-label={`当前身份 ${getRoleLabel(activeRole)}，打开设置`} onClick={() => setView('settings')}><RolePortrait role={activeRole} urls={avatarUrls} /><span>+</span></button></div></header>
         {!readOnly && syncStatus !== 'clean' && <div className={`sync-banner sync-banner-${syncStatus}`} role={syncStatus === 'error' || syncStatus === 'conflict' ? 'alert' : 'status'}><span className="status-dot" /><span>{syncStatus === 'loading' ? '共享内容加载中，暂时不能编辑。' : syncStatus === 'saving' ? '正在保存最新修改…' : syncStatus === 'conflict' ? '内容已被另一台设备修改，请刷新后重试。' : '同步失败，请检查网络后重试。'}</span></div>}
         <div className="page-content">
           <LolitaPageDecor surface={lolitaSurface} />
           <AnimatePresence mode="wait" initial={false}>
             <motion.div key={view} {...viewFadeRise}>
              {view === 'home' && <Dashboard data={data} activeRole={activeRole} relationship={relationship} nextMilestone={nextMilestone} recentEntry={recentEntry} recentPhoto={recentPhoto} timezone={data.timezone} readOnly={readOnly} canWrite={editingReady} avatars={avatarUrls} openView={openView} onAddMemory={() => { if (editingReady) setSheet({ type: 'memory-form' }); else canWrite(); }} onAddMilestone={() => { if (editingReady) setSheet({ type: 'milestone-form' }); else canWrite(); }} onAddPlan={() => { if (editingReady) setSheet({ type: 'plan-form' }); else canWrite(); }} onSetRelationshipStart={() => { if (editingReady) setSheet({ type: 'settings-form' }); else canWrite(); }} onTogglePlan={(plan) => { if (editingReady) void savePlan({ ...plan, status: plan.status === '已完成' ? '计划中' : '已完成' }); else canWrite(); }} />}
              {view === 'timeline' && <TimelineView entries={timeline} photos={data.photos} readOnly={readOnly} disabled={!editingReady} onAddMemory={() => { if (editingReady) setSheet({ type: 'memory-form' }); else canWrite(); }} onAddMilestone={() => { if (editingReady) setSheet({ type: 'milestone-form' }); else canWrite(); }} onOpen={(entry) => setSheet({ type: 'timeline-detail', entry })} onEdit={(entry) => setSheet(entry.type === 'memory' ? { type: 'memory-form', entry } : { type: 'milestone-form', entry })} onDelete={(entry) => void deleteTimelineEntry(entry)} />}
              {view === 'photos' && <PhotosView photos={data.photos} uploads={uploads} timeline={timeline} readOnly={readOnly} disabled={!editingReady} onUpload={addPhotos} onOpen={(photo) => setSheet({ type: 'photo-detail', photo })} onOpenTimeline={(entryId) => openView('timeline', entryId)} onClearUpload={(id) => setUploads((current) => current.filter((item) => item.id !== id))} onRetry={retryUpload} getAsset={(photo, variant) => repository.getPhotoAssetUrl(photo, variant)} />}
              {view === 'plans' && <PlansView plans={data.plans} readOnly={readOnly} disabled={!editingReady} onAdd={() => { if (editingReady) setSheet({ type: 'plan-form' }); else canWrite(); }} onEdit={(plan) => setSheet({ type: 'plan-form', plan })} onDelete={(plan) => void deletePlan(plan)} onToggle={(plan) => { if (editingReady) void savePlan({ ...plan, status: plan.status === '已完成' ? '计划中' : '已完成' }); else canWrite(); }} onWriteMemory={(plan) => { if (editingReady) setSheet({ type: 'memory-form', draft: { ...createMemoryDraftFromPlan(plan, todayString(data.timezone)), createdByRole: activeRole } }); else canWrite(); }} />}
              {view === 'settings' && <SettingsView data={data} activeRole={activeRole} publicDemo={config.publicDemo} remoteMode={remoteMode} readOnly={readOnly} onReset={resetSpace} onEditStart={() => { if (editingReady) setSheet({ type: 'settings-form' }); else canWrite(); }} onRoleChange={setActiveRole} onLock={onLock} />}
             </motion.div>
           </AnimatePresence>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="移动端导航">{navItems.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} compact />)}</nav>
      <AnimatePresence>
        {activeSheetNode && <motion.div key={activeSheetNode.key} style={{ display: 'contents' }}>{activeSheetNode.node}</motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <motion.div key="toast" className="toast" role="status" initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .97 }} transition={springSnappy}><Check size={17} />{toast}</motion.div>}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

function NavButton({ item, active, onClick, compact = false }: { item: typeof navItems[number]; active: boolean; onClick: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return <button className={`nav-button ${active ? 'active' : ''} ${compact ? 'compact' : ''}`} onClick={onClick}><Icon size={compact ? 19 : 18} /><span>{item.label}</span></button>;
}

function RoleBadge({ role, prefix = '' }: { role?: SpaceRole; prefix?: string }) {
  const normalized = role ?? 'unknown';
  const label = getRoleLabel(normalized);
  return <span className="role-badge" data-role={normalized} aria-label={`${prefix}${label}`}><span className="role-badge-mark" aria-hidden="true">{normalized === 'both' ? 'L/W' : normalized === 'unknown' ? '?' : label}</span><span>{prefix}{label}</span></span>;
}

function RolePicker({ value, onChange, label = '添加者', includeBoth = true, includeUnknown = false }: { value: SpaceRole; onChange: (role: SpaceRole) => void; label?: string; includeBoth?: boolean; includeUnknown?: boolean }) {
  const options: SpaceRole[] = ['l', 'w', ...(includeBoth ? ['both' as const] : []), ...(includeUnknown ? ['unknown' as const] : [])];
  return <div className="role-picker" role="group" aria-label={label}><span className="label-hint">{label}</span><div className="role-picker-options">{options.map((role) => <button key={role} type="button" className={value === role ? 'selected' : ''} data-role={role} aria-pressed={value === role} onClick={() => onChange(role)}><span className="role-picker-dot" aria-hidden="true" />{getRoleLabel(role)}</button>)}</div></div>;
}

function RolePair({ avatars = {} }: { avatars?: AvatarUrls }) {
  return <div className="role-pair" aria-label="两个人的角色"><div className="role-pair-card" data-role="l"><StampFrame className="role-pair-stamp"><RolePortrait role="l" urls={avatars} /></StampFrame><span><strong>海蓝色的 L</strong><small>留住细节的人</small></span></div><div className="role-pair-card" data-role="w"><StampFrame className="role-pair-stamp"><RolePortrait role="w" urls={avatars} /></StampFrame><span><strong>粉色的 W</strong><small>让日子变甜的人</small></span></div></div>;
}

function Dashboard({ data, activeRole, relationship, nextMilestone, recentEntry, recentPhoto, timezone, readOnly, canWrite, avatars, openView, onAddMemory, onAddMilestone, onAddPlan, onSetRelationshipStart, onTogglePlan }: { data: SpaceData; activeRole: ActiveRole; relationship: ReturnType<typeof getRelationshipDuration>; nextMilestone?: TimelineDisplayEntry; recentEntry?: TimelineDisplayEntry; recentPhoto?: Photo; timezone: string; readOnly: boolean; canWrite: boolean; avatars: AvatarUrls; openView: (view: ViewKey, id?: string) => void; onAddMemory: () => void; onAddMilestone: () => void; onAddPlan: () => void; onSetRelationshipStart: () => void; onTogglePlan: (plan: PlanItem) => void }) {
  const openPlans = data.plans.filter((plan) => plan.status !== '已完成' && plan.status !== '搁置');
  const today = formatDate(getDateInTimezone(new Date(), timezone), { weekday: 'long', month: 'long', day: 'numeric' });
  const planSummary = (plan: PlanItem) => plan.location ?? plan.note ?? (plan.dueDate ? formatShortDate(plan.dueDate) : '还没有补充说明');
  return <div className="dashboard-stack">
    <section className="welcome-band lolita-paper lace-top"><WashiTape tone="pink" to="left" /><WashiTape tone="blue" to="right" /><LolitaPaperDecor /><div className="welcome-copy"><span className="eyebrow">{today}</span><h1>你好，<em>你们。</em></h1><StitchLine className="welcome-stitch" /><p>今天也有一些小事，值得一起记住。</p><div className="active-role-note"><RoleBadge role={activeRole} prefix="现在由 " /><span>记录这一刻</span></div></div><div className="welcome-illustration"><MaterialSticker asset={MATERIAL_ASSETS.cupcake} tone="rose" placement="hero" size="lg" /><span className="welcome-illustration-caption">two people,<br />one timeline</span></div></section>
    <RolePair avatars={avatars} />
     <section className="relationship-grid"><div className="relationship-panel">{relationship ? <><div className="panel-label">我们已经</div><TicketStub className="duration-ticket"><div className="duration"><strong>{relationship.years}</strong><span>年</span><strong>{relationship.months}</strong><span>个月</span><strong>{relationship.days}</strong><span>天</span></div></TicketStub><div className="duration-foot">共走过 {relationship.totalDays.toLocaleString()} 天 <span>·</span> 还会有更多</div><div className="relationship-line" /></> : <div className="relationship-empty"><div className="panel-label">OUR STARTING POINT</div><h3>还没有设置开始日</h3><p>填写后，这里会开始记录你们一起走过的时间。</p><button className="button button-light" onClick={onSetRelationshipStart} disabled={!canWrite}><CalendarDays size={16} />设置开始日</button></div>}</div><div className="anniversary-panel"><div className="panel-topline"><span className="tag tag-coral">UP NEXT</span>{nextMilestone && <button className="text-button" onClick={() => openView('timeline', nextMilestone.id)}>去时间线 <ArrowUpRight size={15} /></button>}</div><h3>{nextMilestone?.title ?? '添加一个重要日子'}</h3><p>{nextMilestone ? `${formatTimelineDate(nextMilestone, nextMilestone.nextOccurrence ?? nextMilestone.date)}${nextMilestone.location ? ` · ${nextMilestone.location}` : ''}` : '把下一个想庆祝的日子放进来。'}</p><div className="big-countdown">{nextMilestone ? <Postmark value={nextMilestone.countdownDays} label="天以后见" /> : <button className="button button-light" onClick={onAddMilestone} disabled={!canWrite}><Plus size={16} />添加日子</button>}</div></div></section>
    <div className="section-heading"><div><span className="eyebrow">THE STORY SO FAR</span><h2>最近发生的事</h2></div><button className="text-button" onClick={() => openView('timeline')}>查看时间线 <ArrowUpRight size={15} /></button></div>
     <section className="home-grid"><article className="memory-feature"><WashiTape tone="blue" to="right" className="tape-corner-a" /><div className="feature-image" style={{ backgroundImage: recentPhoto ? `url(${recentPhoto.src})` : undefined }}><span className="image-caption">{recentPhoto?.caption ?? '还没有照片'}</span></div><div className="feature-copy"><div className="item-meta"><span>{recentEntry ? formatDate(recentEntry.date, { year: 'numeric', month: 'short', day: 'numeric' }) : '还没有回忆'}</span><span>{recentEntry?.location}</span></div><h3>{recentEntry?.title ?? '记录你们的第一条回忆'}</h3><p>{recentEntry?.type === 'memory' ? recentEntry.body : recentEntry?.note ?? '从一句话开始，把重要的瞬间留在这里。'}</p><div className="action-group"><button className="button button-outline" onClick={onAddMemory} disabled={!canWrite}><Plus size={16} />记录一件事</button>{recentEntry && <button className="text-button" onClick={() => openView('timeline', recentEntry.id)}>查看详情 <ArrowUpRight size={15} /></button>}</div></div></article><aside className="home-side-column"><div className="mini-section"><div className="section-heading compact-heading"><h3>接下来一起做 <span>{openPlans.length}</span></h3><button className="icon-button small" title="添加计划" aria-label="添加计划" onClick={onAddPlan} disabled={!canWrite}><Plus size={16} /></button></div>{openPlans.slice(0, 3).map((plan) => <PlanRow key={plan.id} plan={plan} onToggle={onTogglePlan} disabled={!canWrite} />)}{openPlans.length === 0 && <EmptyState text="还没有待完成的计划。" />}</div><StickyNote className="mini-section quote-section"><Sparkles size={17} /><p>把小事也认真记下来。</p><span>— 留给未来的你们</span></StickyNote></aside></section>
    <div className="section-heading"><div><span className="eyebrow">FOR LATER / TOGETHER</span><h2>计划中的小事</h2></div><button className="text-button" onClick={() => openView('plans')}>查看全部 <ArrowUpRight size={15} /></button></div>
     <section className="plan-preview-grid">{openPlans.slice(0, 3).map((plan) => <article className="plan-preview" key={plan.id}><div className="plan-preview-icon"><ListTodo size={18} /></div><div><span className="tag tag-soft">{plan.type}</span><h3>{plan.title}</h3><p>{planSummary(plan)}</p></div><button className="text-button" onClick={() => openView('plans')}>查看计划 <ArrowUpRight size={15} /></button></article>)}{openPlans.length === 0 && <EmptyState text="把想去、想看、想一起完成的事放在这里。" />}</section>
  </div>;
}

function TimelineView({ entries, photos, readOnly, disabled, onAddMemory, onAddMilestone, onOpen, onEdit, onDelete }: { entries: TimelineDisplayEntry[]; photos: Photo[]; readOnly: boolean; disabled: boolean; onAddMemory: () => void; onAddMilestone: () => void; onOpen: (entry: TimelineDisplayEntry) => void; onEdit: (entry: TimelineDisplayEntry) => void; onDelete: (entry: TimelineDisplayEntry) => void }) {
  return <div className="view-stack"><ViewIntro eyebrow="THE STORY SO FAR" title="回忆时间线" description="重要的日子和普通的日子，都在同一条线上像相册页一样留下来。" action={!readOnly && <div className="action-group"><button className="button button-outline" onClick={onAddMilestone} disabled={disabled}><CalendarDays size={16} />重要日子</button><button className="button button-dark" onClick={onAddMemory} disabled={disabled}><Plus size={17} />写一条回忆</button></div>} /><motion.div className="timeline" variants={stackStagger} initial="hidden" animate="show">{entries.map((entry, index) => <TimelineItem key={entry.id} entry={entry} photos={photos} index={index} readOnly={readOnly} disabled={disabled} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />)}</motion.div>{entries.length === 0 && <section className="timeline-empty"><div className="timeline-empty-mark"><Sparkles size={22} /></div><div><h3>第一张相册页还空着</h3><p>{readOnly ? '公开预览暂时没有内容。私密空间登录后可以开始记录。' : '从一条回忆或一个重要日子开始，慢慢把你们的故事放进来。'}</p>{!readOnly && <div className="action-group"><button className="button button-outline" onClick={onAddMilestone} disabled={disabled}><CalendarDays size={16} />添加重要日子</button><button className="button button-dark" onClick={onAddMemory} disabled={disabled}><Plus size={16} />写第一条回忆</button></div>}</div></section>}</div>;
}

function TimelineItem({ entry, photos, index, readOnly, disabled, onOpen, onEdit, onDelete }: { entry: TimelineDisplayEntry; photos: Photo[]; index: number; readOnly: boolean; disabled: boolean; onOpen: (entry: TimelineDisplayEntry) => void; onEdit: (entry: TimelineDisplayEntry) => void; onDelete: (entry: TimelineDisplayEntry) => void }) {
  const entryPhotos = photos.filter((photo) => photo.timelineEntryId === entry.id);
  const cover = entryPhotos[0];
  const isMilestone = entry.type === 'milestone';
  const isSystem = isMilestone && Boolean(entry.systemRole);
  const date = new Date(`${entry.date}T12:00:00`);
  return <motion.article id={`timeline-${entry.id}`} className={`timeline-item ${isMilestone ? 'milestone-item' : ''}`} variants={itemFallIntoPlace} style={{ '--timeline-index': index } as CSSProperties}><div className="timeline-date"><strong>{date.getDate()}</strong><span>{new Intl.DateTimeFormat('zh-CN', { month: 'short', year: 'numeric' }).format(date)}</span></div><div className="timeline-dot"><span /></div><div className="memory-entry"><div className="memory-page"><button className="timeline-content-button" onClick={() => onOpen(entry)}>{cover ? <div className="memory-cover" style={{ backgroundImage: `url(${cover.src})` }}><span>{entryPhotos.length} 张照片</span></div> : <div className="memory-cover memory-cover-empty"><ImageIcon size={22} /><span>还没有照片</span></div>}<div className="memory-page-copy"><div className="memory-entry-top"><div><span className="item-meta">{isMilestone ? <span className="timeline-kind">重要日子</span> : entry.location ?? '未记录地点'} <span>·</span> {isSystem ? '关系起点' : isMilestone && entry.repeatAnnual ? '每年重复' : '回忆'}</span><h3>{entry.title}</h3></div><RoleBadge role={entry.createdByRole} prefix="由 " /></div><p>{isMilestone ? entry.note ?? '为这一天留下一点说明。' : entry.body}</p>{!isMilestone && entry.tags.length > 0 && <div className="tag-row">{entry.tags.map((tag) => <span className="tag tag-soft" key={tag}># {tag}</span>)}</div>}{isMilestone && entry.nextOccurrence && <div className="milestone-countdown"><CalendarDays size={14} />下一次 {formatTimelineDate(entry, entry.nextOccurrence)} · 还有 {entry.countdownDays} 天</div>}</div></button></div><div className="entry-actions">{!readOnly && !isSystem && <button className="icon-button subtle" title="编辑" aria-label={`编辑${entry.title}`} onClick={() => onEdit(entry)} disabled={disabled}><Pencil size={15} /></button>}{!readOnly && !isSystem && <button className="icon-button subtle danger-icon" title="删除" aria-label={`删除${entry.title}`} onClick={() => onDelete(entry)} disabled={disabled}><Trash2 size={15} /></button>}<button className="icon-button subtle" title="查看详情" aria-label={`查看${entry.title}`} onClick={() => onOpen(entry)}><MoreHorizontal size={16} /></button></div></div></motion.article>;
}

function formatMonthLabel(month: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(`${month}-01T12:00:00`));
}

function formatPhotoDay(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function photoAspectRatio(photo: Photo): number {
  if (!photo.width || !photo.height) return 1.25;
  return Math.min(1.65, Math.max(.72, photo.width / photo.height));
}

function useScrapbookViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const listener = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return isNarrow;
}

function PhotosView({ photos, uploads, timeline, readOnly, disabled, onUpload, onOpen, onOpenTimeline, onClearUpload, onRetry, getAsset }: { photos: Photo[]; uploads: UploadItem[]; timeline: TimelineDisplayEntry[]; readOnly: boolean; disabled: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onOpen: (photo: Photo) => void; onOpenTimeline: (entryId: string) => void; onClearUpload: (id: string) => void; onRetry: (item: UploadItem) => void; getAsset: (photo: Photo, variant: PhotoAssetVariant) => Promise<string | undefined> }) {
  const groups = groupPhotosByDate(photos);
  return <div className="view-stack">
    <ViewIntro eyebrow="THE LITTLE DETAILS" title="照片" description={`${photos.length} 张照片，把普通日子串成一面墙。`} action={!readOnly && <label className="button button-dark"><Upload size={17} />选择照片<input className="visually-hidden" type="file" accept="image/*,video/*" multiple onChange={onUpload} disabled={disabled} /></label>} />
    {groups.length > 0 ? <div className="photo-timeline" aria-label="照片时间线">{groups.map((month) => <section className="photo-month" key={month.month} aria-labelledby={`photo-month-${month.month}`}><div className="photo-month-heading"><span className="photo-month-knot" aria-hidden="true" /><h2 id={`photo-month-${month.month}`}>{formatMonthLabel(month.month)}</h2><FilmStripDivider className="month-strip" /></div>{month.days.map((day) => <section className="photo-day" key={day.date} aria-labelledby={`photo-day-${day.date}`}><div className="photo-day-heading"><time id={`photo-day-${day.date}`} dateTime={day.date}>{formatPhotoDay(day.date)}</time><span>{day.photos.length} 张照片</span></div><div className="photo-rope-row">{day.photos.map((photo, index) => <PhotoCard key={photo.id} photo={photo} index={index} timeline={timeline} onOpen={onOpen} onOpenTimeline={onOpenTimeline} getAsset={getAsset} />)}</div></section>)}</section>)}</div> : <EmptyState text={readOnly ? '公开预览暂无照片。' : '还没有照片，选几张你们的日常吧。'} sticker="doughnut" />}
    {uploads.length > 0 && <UploadQueue uploads={uploads} onClear={onClearUpload} onRetry={onRetry} />}
    {photos.length > 0 && <p className="view-note"><Camera size={16} /> 原图保留，照片墙按屏幕尺寸加载展示版。</p>}
  </div>;
}

function PhotoCard({ photo, index, timeline, onOpen, onOpenTimeline, getAsset }: { photo: Photo; index: number; timeline: TimelineDisplayEntry[]; onOpen: (photo: Photo) => void; onOpenTimeline: (entryId: string) => void; getAsset: (photo: Photo, variant: PhotoAssetVariant) => Promise<string | undefined> }) {
  const [refreshedSrc, setRefreshedSrc] = useState<string>();
  const [hasRetriedSource, setHasRetriedSource] = useState(false);
  const isNarrow = useScrapbookViewport();
  const linkedEntry = photo.timelineEntryId ? timeline.find((entry) => entry.id === photo.timelineEntryId) : undefined;
  const displaySrc = refreshedSrc || photo.thumbnailSrc || photo.src;
  const srcSet = refreshedSrc ? undefined : photo.thumbnailSrc && photo.src && photo.thumbnailSrc !== photo.src ? `${photo.thumbnailSrc} 720w, ${photo.src} 2048w` : undefined;
  const restingRotation = isNarrow ? -0.7 : index % 2 === 0 ? -1.1 : 1.1;

  async function refreshExpiredSource() {
    if (hasRetriedSource) return;
    setHasRetriedSource(true);
    const source = await getAsset(photo, 'thumbnail').catch(() => undefined);
    if (source) setRefreshedSrc(source);
  }

  return <motion.article
    className={`photo-hanging-card doily-host ${index % 2 === 0 ? 'hang-left' : 'hang-right'} ${photo.mediaKind === 'live' ? 'is-live' : ''}`}
    style={{ '--photo-ratio': photoAspectRatio(photo) } as CSSProperties}
    initial={{ opacity: 0, y: 26, rotate: restingRotation * 2.4 }}
    whileInView={{ opacity: 1, y: 0, rotate: restingRotation }}
    viewport={{ once: true, margin: '0px 0px -36px 0px' }}
    whileHover={{ y: -6, rotate: 0 }}
    transition={{ type: 'spring', stiffness: 260, damping: 25 }}>
    <span className="photo-clip" aria-hidden="true" />
    <button className="photo-card-main" onClick={() => onOpen(photo)} aria-label={`查看${photo.caption || '照片'}`}>
      <motion.div className="photo-frame" layoutId={`photo-${photo.id}`}>{photo.previewAvailable === false ? <div className="photo-unavailable"><ImageIcon size={22} /><span>当前浏览器无法预览原格式</span></div> : <img src={displaySrc} srcSet={srcSet} sizes="(max-width: 700px) 82vw, 360px" alt={photo.caption || '照片'} loading="lazy" decoding="async" onError={() => void refreshExpiredSource()} />}{photo.mediaKind === 'live' && <span className="photo-live-badge"><Play size={11} fill="currentColor" />动态</span>}</motion.div>
      <div className="photo-card-copy"><div className="photo-card-title"><strong>{photo.caption || '未命名照片'}</strong><RoleBadge role={photo.createdByRole} prefix="由 " /></div><time dateTime={photo.date}>{formatShortDate(photo.date)}</time></div>
    </button>
    {linkedEntry && <button className="photo-memory-link" onClick={() => onOpenTimeline(linkedEntry.id)}><span>{linkedEntry.title}</span><ArrowUpRight size={13} /></button>}
  </motion.article>;
}

function UploadQueue({ uploads, onClear, onRetry }: { uploads: UploadItem[]; onClear: (id: string) => void; onRetry: (item: UploadItem) => void }) {
  return <section className="upload-queue"><div className="section-heading compact-heading"><h3>上传队列</h3><span className="queue-count">{uploads.filter((item) => item.status === 'done').length}/{uploads.length}</span></div><AnimatePresence initial={false}>{uploads.map((item) => <motion.div className="upload-row" key={item.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 32 }}><div className="upload-row-copy"><strong>{item.name}</strong><span>{item.status === 'failed' ? item.error : item.stage}</span></div><div className={`upload-progress ${item.status === 'preparing' || item.status === 'uploading' ? 'is-active' : ''}`}><span className={item.status === 'done' ? 'is-complete' : ''} /></div>{item.status === 'failed' && item.retryable !== false ? <button className="text-button" onClick={() => onRetry(item)}>重试</button> : <button className="icon-button small" title="移除上传记录" aria-label="移除上传记录" onClick={() => onClear(item.id)}><X size={14} /></button>}</motion.div>)}</AnimatePresence></section>;
}

function PhotoDetailSheet({ photo, timeline, readOnly, disabled, onClose, onEdit, onDelete, onOpenTimeline, getAsset }: { photo: Photo; timeline: TimelineDisplayEntry[]; readOnly: boolean; disabled: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenTimeline: (entryId: string) => void; getAsset: (photo: Photo, variant: PhotoAssetVariant) => Promise<string | undefined> }) {
  const [motionSrc, setMotionSrc] = useState(photo.motionSrc);
  const [assetError, setAssetError] = useState('');
  const linkedEntry = photo.timelineEntryId ? timeline.find((entry) => entry.id === photo.timelineEntryId) : undefined;

  useEffect(() => {
    if (photo.mediaKind !== 'live' || motionSrc) return;
    let cancelled = false;
    getAsset(photo, 'motion').then((source) => {
      if (!cancelled) setMotionSrc(source);
    }).catch(() => {
      if (!cancelled) setAssetError('动态片段暂时无法读取。');
    });
    return () => { cancelled = true; };
  }, [getAsset, motionSrc, photo]);

  async function openOriginal() {
    try {
      const source = photo.originalSrc ?? await getAsset(photo, 'original');
      if (!source) throw new Error('原图暂时无法读取。');
      const link = document.createElement('a');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.download = photo.caption || photo.id;
      link.click();
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '原图暂时无法读取。');
    }
  }

  return <Sheet title={photo.caption || '照片详情'} eyebrow={photo.mediaKind === 'live' ? 'LIVE PHOTO' : 'PHOTO'} onClose={onClose}><PolaroidFrame caption={`${photo.caption || '未命名照片'} · ${formatShortDate(photo.date)}`} rotate={-0.5} className="detail-polaroid"><motion.div className="photo-detail-hero" layoutId={`photo-${photo.id}`}>{photo.previewAvailable === false ? <div className="photo-unavailable"><ImageIcon size={26} /><span>当前浏览器无法预览原格式，可直接打开原图</span></div> : <img src={photo.src} alt={photo.caption || '照片'} />}{photo.mediaKind === 'live' && motionSrc && <video src={motionSrc} poster={photo.previewAvailable === false ? undefined : photo.src} controls playsInline preload="metadata" />}</motion.div></PolaroidFrame><div className="detail-meta"><RoleBadge role={photo.createdByRole} prefix="由 " /><span><Camera size={13} />{formatDate(photo.date, { year: 'numeric', month: 'long', day: 'numeric' })}</span>{photo.originalBytes && <span>· {Math.round(photo.originalBytes / 1024 / 1024 * 10) / 10}MB 原图</span>}</div>{linkedEntry && <button className="photo-detail-memory" onClick={() => onOpenTimeline(linkedEntry.id)}><Film size={16} /><span>关联回忆：{linkedEntry.title}</span><ArrowUpRight size={15} /></button>}{assetError && <p className="form-error">{assetError}</p>}<div className="form-actions">{!readOnly && !disabled && <><button className="button button-outline" onClick={onEdit}><Pencil size={16} />编辑</button><button className="button button-danger" onClick={onDelete}><Trash2 size={16} />删除</button></>}<button className="button button-dark" onClick={() => void openOriginal()}><Download size={16} />打开原图</button></div></Sheet>;
}

function PlansView({ plans, readOnly, disabled, onAdd, onEdit, onDelete, onToggle, onWriteMemory }: { plans: PlanItem[]; readOnly: boolean; disabled: boolean; onAdd: () => void; onEdit: (plan: PlanItem) => void; onDelete: (plan: PlanItem) => void; onToggle: (plan: PlanItem) => void; onWriteMemory: (plan: PlanItem) => void }) {
  const active = plans.filter((plan) => plan.status !== '已完成' && plan.status !== '搁置');
  const completed = plans.filter((plan) => plan.status === '已完成');
  const paused = plans.filter((plan) => plan.status === '搁置');
  return <div className="view-stack"><ViewIntro eyebrow="FOR LATER / TOGETHER" title="计划" description="把想去、想看、想买和想一起完成的事，放在同一份清单里。" action={!readOnly && <button className="button button-dark" onClick={onAdd} disabled={disabled}><Plus size={17} />添加计划</button>} /><section className="task-board"><div className="task-board-head"><div><span className="eyebrow">OPEN PLANS</span><h2>{active.length} 件进行中</h2></div><Postmark value={`${Math.round((completed.length / Math.max(plans.length, 1)) * 100)}%`} label="已完成" /></div><div className="task-list">{active.map((plan) => <PlanRow key={plan.id} plan={plan} large disabled={disabled} onToggle={onToggle} onEdit={!readOnly ? onEdit : undefined} onDelete={!readOnly ? onDelete : undefined} />)}</div>{completed.length > 0 && <><div className="task-divider"><span>已完成</span></div><div className="task-list completed-list">{completed.map((plan) => <PlanRow key={plan.id} plan={plan} large disabled={disabled} onToggle={onToggle} onEdit={!readOnly ? onEdit : undefined} onDelete={!readOnly ? onDelete : undefined} onWriteMemory={!readOnly ? onWriteMemory : undefined} />)}</div></>}{paused.length > 0 && <><div className="task-divider"><span>暂时搁置</span></div><div className="task-list completed-list">{paused.map((plan) => <PlanRow key={plan.id} plan={plan} large disabled={disabled} onToggle={onToggle} onEdit={!readOnly ? onEdit : undefined} onDelete={!readOnly ? onDelete : undefined} />)}</div></>}</section></div>;
}

function PlanRow({ plan, large = false, disabled = false, onToggle, onEdit, onDelete, onWriteMemory }: { plan: PlanItem; large?: boolean; disabled?: boolean; onToggle: (plan: PlanItem) => void; onEdit?: (plan: PlanItem) => void; onDelete?: (plan: PlanItem) => void; onWriteMemory?: (plan: PlanItem) => void }) {
  const done = plan.status === '已完成';
  return <div className={`task-row ${large ? 'large' : ''} ${done ? 'done' : ''}`}><button className="check-button" title={done ? '标记为未完成' : '标记为完成'} aria-label={done ? '标记为未完成' : '标记为完成'} onClick={() => onToggle(plan)} disabled={disabled}>{done ? <Check size={14} /> : <Circle size={16} />}</button><div className="task-content"><strong>{plan.title}</strong><span>{plan.type} <span>·</span> 负责人 {getRoleLabel(plan.assignee)}{plan.dueDate && <> <span>·</span> {formatShortDate(plan.dueDate)}</>}</span></div><RoleBadge role={plan.createdByRole} prefix="由 " /><span className={`priority priority-${plan.priority}`} />{large && <div className="row-actions">{done && onWriteMemory && <button className="text-button small-text" onClick={() => onWriteMemory(plan)} disabled={disabled}>写成回忆</button>}{onEdit && <button className="icon-button small" title="编辑计划" aria-label={`编辑${plan.title}`} onClick={() => onEdit(plan)} disabled={disabled}><Pencil size={14} /></button>}{onDelete && <button className="icon-button small danger-icon" title="删除计划" aria-label={`删除${plan.title}`} onClick={() => onDelete(plan)} disabled={disabled}><Trash2 size={14} /></button>}</div>}</div>;
}

function SettingsView({ data, activeRole, publicDemo, remoteMode, readOnly, onReset, onEditStart, onRoleChange, onLock }: { data: SpaceData; activeRole: ActiveRole; publicDemo: boolean; remoteMode: boolean; readOnly: boolean; onReset: () => void; onEditStart: () => void; onRoleChange: (role: ActiveRole) => void; onLock: () => void }) {
  const accessLabel = readOnly ? '公开预览' : publicDemo ? '公开演示' : remoteMode ? '私密共享' : '本地演示';
  const accessDescription = readOnly ? '当前为空数据只读公开预览。私密修改请打开 ?space=private。' : publicDemo ? '当前为空间公开演示模式，请不要上传真实隐私照片。' : remoteMode ? '当前使用 Supabase Auth 和私有 Storage，两台设备会共享同一份内容。' : '当前内容保存在这个浏览器中，数据不会自动同步到其他设备。';
  const dangerEyebrow = readOnly ? 'PUBLIC PREVIEW' : remoteMode ? 'PRIVATE SHARED SPACE' : 'LOCAL SPACE';
  return <div className="view-stack"><ViewIntro eyebrow="SPACE SETTINGS" title="设置" description="这里管理你们的空间偏好。重要日期会按设定时区计算。" /><section className="settings-list"><div className="settings-item"><div className="settings-icon"><Heart size={18} /></div><div><strong>空间名称</strong><span>{data.spaceName} · 两个人共同编辑</span></div><ChevronRight size={18} className="muted-icon" /></div><div className="settings-item settings-role-item"><div className="settings-icon"><Heart size={18} /></div><div><strong>当前身份</strong><span>新建回忆、照片和计划会默认标记为 {getRoleLabel(activeRole)}。</span><RolePicker value={activeRole} onChange={(role) => { if (role === 'l' || role === 'w') onRoleChange(role); }} label="当前身份" includeBoth={false} /></div></div><button className="settings-item settings-item-button" onClick={onEditStart} disabled={readOnly}><div className="settings-icon"><CalendarDays size={18} /></div><div><strong>恋爱开始日</strong><span>{data.relationshipStart ? `${formatDate(data.relationshipStart, { year: 'numeric', month: 'long', day: 'numeric' })} · ${data.timezone}` : '尚未设置，设置后会开始显示恋爱时长'}</span></div><span className="settings-badge">{readOnly ? '只读' : '编辑'}</span></button><div className="settings-item"><div className="settings-icon"><LockKeyhole size={18} /></div><div><strong>访问安全</strong><span>{accessDescription}</span></div><span className="settings-badge">{accessLabel}</span></div><a className="settings-item settings-item-button" href={getPublicAssetPath('assets/ATTRIBUTIONS.md')} target="_blank" rel="noreferrer"><div className="settings-icon"><Sparkles size={18} /></div><div><strong>视觉素材致谢</strong><span>查看本地贴纸与实拍材质的作者、来源和许可证。</span></div><ChevronRight size={18} className="muted-icon" /></a></section>{!readOnly ? <section className="settings-danger"><div><span className="eyebrow">{dangerEyebrow}</span><h3>清空空间</h3><p>清空后不会恢复任何示例数据。</p></div><div className="settings-actions"><button className="button button-danger" onClick={onReset}><Trash2 size={16} />清空内容</button><button className="button button-outline" onClick={onLock}><LockKeyhole size={16} />锁定空间</button></div></section> : <section className="settings-danger settings-readonly-note"><span className="eyebrow">PUBLIC PREVIEW</span><h3>这是只读入口</h3><p>真实内容和照片请只放在带有 ?space=private 查询参数的私密入口。</p></section>}</div>;
}

function TimelineDetailSheet({ entry, photos, readOnly, disabled, onClose, onEdit, onDelete }: { entry: TimelineDisplayEntry; photos: Photo[]; readOnly: boolean; disabled: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const entryPhotos = photos.filter((photo) => photo.timelineEntryId === entry.id);
  const isSystem = entry.type === 'milestone' && Boolean(entry.systemRole);
  return <Sheet title={entry.type === 'milestone' ? '重要日子' : '回忆详情'} eyebrow={entry.type === 'milestone' ? 'MILESTONE' : 'MEMORY'} onClose={onClose}><div className="detail-meta"><RoleBadge role={entry.createdByRole} prefix="由 " /><span>{formatTimelineDate(entry, entry.date)}</span>{entry.location && <><span>·</span><span><MapPin size={13} />{entry.location}</span></>}</div><h2 className="detail-title">{entry.title}</h2><p className="detail-body">{entry.type === 'milestone' ? entry.note ?? '为这一天留下一点说明。' : entry.body}</p>{entry.type === 'milestone' && entry.nextOccurrence && <div className="detail-highlight"><CalendarDays size={17} /><div><strong>{entry.repeatAnnual ? '下一次纪念日' : '日期倒计时'}</strong><span>{formatTimelineDate(entry, entry.nextOccurrence)} · 还有 {entry.countdownDays} 天</span></div></div>}{entry.type === 'memory' && entry.tags.length > 0 && <div className="tag-row">{entry.tags.map((tag) => <span className="tag tag-soft" key={tag}># {tag}</span>)}</div>}{entryPhotos.length > 0 && <div className="detail-photo-grid">{entryPhotos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.caption} />)}</div>}<div className="form-actions">{!readOnly && !disabled && !isSystem && <button className="button button-outline" onClick={onEdit}><Pencil size={16} />编辑</button>}{!readOnly && !disabled && !isSystem && <button className="button button-danger" onClick={onDelete}><Trash2 size={16} />删除</button>}{(readOnly || disabled || isSystem) && <span className="view-note">{isSystem ? '恋爱开始日由空间设置管理' : readOnly ? '公开预览为只读' : '共享空间正在加载'}</span>}</div></Sheet>;
}

function RelationshipSettingsForm({ relationshipStart, onClose, onSubmit }: { relationshipStart: string | null; onClose: () => void; onSubmit: (relationshipStart: string | null) => void }) {
  const [date, setDate] = useState(relationshipStart ?? '');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(readRelationshipStart(new FormData(event.currentTarget)));
  }
  return <Sheet title="设置恋爱开始日" eyebrow="RELATIONSHIP START" onClose={onClose}><form className="modal-form" onSubmit={submit}><p className="form-description">这一天会成为你们时间线的起点，也会用于计算首页的恋爱时长。</p><label>开始日期<input name="relationship-start" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><FormActions onClose={onClose} submitLabel="保存开始日" /></form></Sheet>;
}

function MemoryForm({ entry, draft, activeRole, onClose, onSubmit }: { entry?: MemoryEntry; draft?: MemoryEntry; activeRole: ActiveRole; onClose: () => void; onSubmit: (memory: MemoryEntry, attachments?: File[]) => void }) {
  const initial = entry ?? draft;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayString());
  const [location, setLocation] = useState(initial?.location ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [createdByRole, setCreatedByRole] = useState<SpaceRole>(initial?.createdByRole ?? activeRole);
  const [attachments, setAttachments] = useState<File[]>([]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date || !body.trim()) return;
    onSubmit({ id: entry?.id ?? newId('memory'), type: 'memory', title: title.trim(), date, location: location.trim(), body: body.trim(), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), createdByRole, createdAt: entry?.createdAt ?? new Date().toISOString(), version: entry?.version, updatedAt: entry?.updatedAt }, attachments);
  }
  return <Sheet title={entry ? '编辑回忆' : '记录一条回忆'} eyebrow={entry ? 'EDIT MEMORY' : 'NEW MEMORY'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一次一起看海" required /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>地点<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="可以留空" /></label></div><label>写下这一刻<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="发生了什么？你记得什么？" rows={5} required /></label><label>标签<span className="label-hint">用逗号分开</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="旅行, 晴天" /></label><RolePicker value={createdByRole} onChange={setCreatedByRole} label="谁添加了这段回忆" includeUnknown={Boolean(entry)} />{!entry && <div className="memory-attachments"><span className="label-hint">附带照片 <span>可选，保存回忆后会自动关联</span></span><label className="button button-outline memory-attachment-picker"><Upload size={16} />选择照片<input className="visually-hidden" type="file" accept="image/*,video/*" multiple onChange={(event) => setAttachments(Array.from(event.target.files ?? []))} /></label>{attachments.length > 0 && <p className="form-description">已选择 {attachments.length} 个文件：{attachments.map((file) => file.name).join('、')}</p>}</div>}<FormActions onClose={onClose} submitLabel="保存回忆" /></form></Sheet>;
}

function MilestoneForm({ entry, activeRole, onClose, onSubmit }: { entry?: MilestoneEntry; activeRole: ActiveRole; onClose: () => void; onSubmit: (milestone: MilestoneEntry) => void }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [date, setDate] = useState(entry?.date ?? '');
  const [repeatAnnual, setRepeatAnnual] = useState(entry?.repeatAnnual ?? true);
  const [time, setTime] = useState(entry?.time ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [createdByRole, setCreatedByRole] = useState<SpaceRole>(entry?.createdByRole ?? activeRole);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    onSubmit({ id: entry?.id ?? newId('milestone'), type: 'milestone', title: title.trim(), date, kind: repeatAnnual ? 'anniversary' : 'one-off', repeatAnnual, time: time || undefined, location: location.trim() || undefined, note: note.trim() || undefined, systemRole: entry?.systemRole, createdByRole, createdAt: entry?.createdAt ?? new Date().toISOString(), version: entry?.version, updatedAt: entry?.updatedAt });
  }
  return <Sheet title={entry ? '编辑重要日子' : '添加重要日子'} eyebrow={entry ? 'EDIT MILESTONE' : 'NEW MILESTONE'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一次见面的日子" required /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>时间<span className="label-hint">可选</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div><div className="segmented-control"><button type="button" className={repeatAnnual ? 'selected' : ''} onClick={() => setRepeatAnnual(true)}>每年重复</button><button type="button" className={!repeatAnnual ? 'selected' : ''} onClick={() => setRepeatAnnual(false)}>一次性</button></div><label>地点<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：赤柱" /></label><label>说明<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="想为这一天留下什么？" rows={4} /></label><RolePicker value={createdByRole} onChange={setCreatedByRole} label="谁添加了这个日子" includeUnknown={Boolean(entry)} /><FormActions onClose={onClose} submitLabel="保存日期" /></form></Sheet>;
}

function PlanForm({ plan, activeRole, onClose, onSubmit }: { plan?: PlanItem; activeRole: ActiveRole; onClose: () => void; onSubmit: (plan: PlanItem) => void }) {
  const [title, setTitle] = useState(plan?.title ?? '');
  const [type, setType] = useState<PlanType>(plan?.type ?? '生活');
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? '想法');
  const [dueDate, setDueDate] = useState(plan?.dueDate ?? '');
  const [location, setLocation] = useState(plan?.location ?? '');
  const [link, setLink] = useState(plan?.link ?? '');
  const [note, setNote] = useState(plan?.note ?? '');
  const [priority, setPriority] = useState<PlanItem['priority']>(plan?.priority ?? 'medium');
  const [assignee, setAssignee] = useState<PlanItem['assignee']>(plan?.assignee ?? 'both');
  const [createdByRole, setCreatedByRole] = useState<SpaceRole>(plan?.createdByRole ?? activeRole);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({ id: plan?.id ?? newId('plan'), title: title.trim(), type, status, dueDate: dueDate || undefined, location: location.trim() || undefined, link: link.trim() || undefined, note: note.trim() || undefined, priority, assignee, createdByRole, completedAt: plan?.completedAt, version: plan?.version, updatedAt: plan?.updatedAt });
  }
  return <Sheet title={plan ? '编辑计划' : '添加计划'} eyebrow={plan ? 'EDIT PLAN' : 'NEW PLAN'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>计划内容<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：找一个周末去看日落" required /></label><div className="form-grid"><label>类型<select value={type} onChange={(event) => setType(event.target.value as PlanType)}><option>地点</option><option>餐厅</option><option>电影</option><option>礼物</option><option>生活</option><option>纪念日</option><option>其他</option></select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as PlanStatus)}><option>想法</option><option>计划中</option><option>已完成</option><option>搁置</option></select></label></div><div className="form-grid"><label>日期<span className="label-hint">可选</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><RolePicker value={assignee} onChange={(role) => { if (role !== 'unknown') setAssignee(role); }} label="负责人" /></div><RolePicker value={createdByRole} onChange={setCreatedByRole} label="谁创建了这个计划" includeUnknown={Boolean(plan)} /><label>地点<span className="label-hint">可选</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：长洲岛" /></label><label>链接<span className="label-hint">可选</span><div className="input-with-icon"><Link2 size={16} /><input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." /></div></label><label>备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="为什么想一起做？" rows={4} /></label><div className="form-grid"><label>优先级<select value={priority} onChange={(event) => setPriority(event.target.value as PlanItem['priority'])}><option value="low">不着急</option><option value="medium">普通</option><option value="high">重要</option></select></label><div /></div><FormActions onClose={onClose} submitLabel="保存计划" /></form></Sheet>;
}

function PhotoForm({ photo, timeline, onClose, onSubmit }: { photo: Photo; timeline: TimelineDisplayEntry[]; onClose: () => void; onSubmit: (photo: Photo) => void }) {
  const [caption, setCaption] = useState(photo.caption);
  const [date, setDate] = useState(photo.date);
  const [timelineEntryId, setTimelineEntryId] = useState(photo.timelineEntryId ?? '');
  const [createdByRole, setCreatedByRole] = useState<SpaceRole>(photo.createdByRole ?? 'unknown');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ ...photo, caption: caption.trim() || '未命名照片', date, timelineEntryId: timelineEntryId || undefined, createdByRole });
  }
  return <Sheet title="编辑照片" eyebrow="EDIT PHOTO" onClose={onClose}><div className="photo-edit-preview"><img src={photo.src} alt={photo.caption} /></div><form className="modal-form" onSubmit={submit}><label>说明<input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="这张照片记得什么？" /></label><div className="form-grid"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>关联时间线<select value={timelineEntryId} onChange={(event) => setTimelineEntryId(event.target.value)}><option value="">独立照片</option>{timeline.filter((entry) => entry.type === 'memory' || entry.type === 'milestone').map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label></div><RolePicker value={createdByRole} onChange={setCreatedByRole} label="谁添加了这张照片" includeUnknown /><FormActions onClose={onClose} submitLabel="保存照片" /></form></Sheet>;
}

function Sheet({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => !element.hasAttribute('disabled'));
    focusable()[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return <motion.div className="sheet-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.section ref={dialogRef} className="sheet lace-top" role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 46, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: .98 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}><div className="sheet-handle" aria-hidden="true" /><div className="modal-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" title="关闭" aria-label="关闭" onClick={onClose}><X size={19} /></button></div>{children}</motion.section></motion.div>;
}

function FormActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return <div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose}>取消</button><button type="submit" className="button button-dark"><Check size={16} />{submitLabel}</button></div>;
}

function ViewIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="view-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="view-intro-action">{action}</div>}</section>;
}

function EmptyState({ text, sticker = 'iceCream' }: { text: string; sticker?: 'iceCream' | 'doughnut' | 'candy' }) {
  const asset = sticker === 'doughnut' ? MATERIAL_ASSETS.doughnut : sticker === 'candy' ? MATERIAL_ASSETS.candy : MATERIAL_ASSETS.iceCream;
  return <div className="empty-state"><MaterialSticker asset={asset} tone="blush" placement="empty" size="sm" /><span>{text}</span></div>;
}

export default App;
