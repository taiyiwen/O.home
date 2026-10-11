'use client';
// Videos 작성/수정 공용 폼 (커플홈) — 제목 · 영상(파일 하나 또는 링크) · 썸네일(선택) · 설명 · 태그 · 공개범위
// 수정 모드: 저장된 영상·썸네일은 그대로 두고, 새로 고르면 바꿔 끼운다
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { useSectionParam, secStamp, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf } from '@/lib/menuStore';
import { useBoardSettings, videoCatsOf } from '@/lib/boardStore';
import { VideoPost, VIDEO_KEY, VIDEO_SEED, videoEmbed, isVideoLink } from '@/lib/videoStore';
import { isFileUrl } from '@/lib/transfer';
import { isServerMode } from '@/lib/backend';
import { Visibility } from '@/lib/charStore';
import { KInput, KSelect, KRadio } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

/** 서버(Firebase Storage) 업로드 한도 — firebaseRules의 20MB와 같다. 더 큰 영상은 링크로 */
const UPLOAD_MAX = 20 * 1024 * 1024;
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

/** 영상에서 썸네일 한 장 뽑기 — 1초 지점(짧으면 중간)을 캔버스로. 코덱을 못 읽으면 null */
function captureFrame(file: File): Promise<File | null> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (f: File | null) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(f); };
    const timer = setTimeout(() => finish(null), 6000);
    v.onerror = () => { clearTimeout(timer); finish(null); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      clearTimeout(timer);
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      if (!c.width) { finish(null); return; }
      c.getContext('2d')?.drawImage(v, 0, 0);
      c.toBlob(b => finish(b ? new File([b], 'poster.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.86);
    };
    v.src = url;
  });
}

/** 썸네일 — 새 파일이면 objectURL, 저장본·바깥 주소면 그대로 */
interface Poster { file?: File; url?: string; ref?: string; label: string }
function PosterPreview({ p }: { p: Poster }) {
  const loaded = useBlobUrl(p.ref);
  const src = p.url ?? loaded;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 6, display: 'block' }} /> : null;
}

export function VideoForm({ initial }: { initial: VideoPost | null }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<VideoPost>(VIDEO_KEY, VIDEO_SEED);
  const sec = useSectionParam('videos');
  const [menuSet, , menuLoaded] = useMenuSettings();
  const isNew = !initial;
  const tt = useSectionTitle('videos', initial ? (initial.secId ?? MAIN_SEC) : sec.id, isNew ? 'WRITE' : 'EDIT');
  const [title, setTitle] = useState(initial?.title ?? '');
  // 영상 — 저장된 글의 video가 바깥 주소(유튜브·노션 파일 주소 등)면 「링크」, 우리 저장소 주소나 파일 id면 「파일」
  const initLink = isVideoLink(initial?.video, isFileUrl) ? initial!.video : '';
  const [vidMode, setVidMode] = useState<'file' | 'link'>(initLink ? 'link' : 'file');
  const [vidFile, setVidFile] = useState<File | null>(null);            // 새로 고른 영상
  const [vidUrl, setVidUrl] = useState<string | undefined>(undefined);   // 그 미리보기 주소
  const [vidLink, setVidLink] = useState(initLink);
  const vidRef = initLink ? undefined : initial?.video;                 // 저장돼 있던 영상 (수정)
  const savedVidUrl = useBlobUrl(vidRef);
  const [poster, setPoster] = useState<Poster | null>(initial?.poster ? { ref: initial.poster, label: '已保存的缩略图' } : null);
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const parseTags = (v: string) => [...new Set(v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  // 말머리 (커플홈 사용자 요청 — 갤러리처럼) — 이 비디오 게시판(섹션)의 말머리 중에서, 이름(label)으로 저장
  const { st: boardSet } = useBoardSettings();
  const videoCats = videoCatsOf(boardSet, initial ? (initial.secId ?? MAIN_SEC) : sec.id);
  const [category, setCategory] = useState(initial?.category ?? '');

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>登录后即可发布内容</p></div>
      </section>
    );
  }
  /* 글쓰기 권한 (커플홈) — WRITE 버튼과 같은 판정으로 주소 직접 진입도 막는다. 새 글만 — 자기 글 수정은 그대로.
     설정을 읽기 전에는 폼을 그리지 않는다 (먼저 그리면 막힐 사람에게 폼이 한 번 비친다) */
  if (isNew && !menuLoaded) return <section className="page" />;
  if (isNew && !canWriteAt(menuSet, writeKeyOf('/videos', sec.id), { loggedIn: true, isAdmin, id: user.id })) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>仅有权限的成员可以在此发布内容</p></div>
      </section>
    );
  }

  /** 영상 파일 고르기 — 종류·크기 확인 후 미리보기. 썸네일이 없으면 영상에서 한 장 뽑아 둔다 */
  const pickVideo = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) { toast('只能上传视频文件（mp4、webm、mov）'); return; }
    if (isServerMode() && f.size > UPLOAD_MAX) {
      toast(`服务器上传上限为 20MB（当前文件 ${fmtSize(f.size)），较大的视频请使用链接`);
      return;
    }
    if (vidUrl) URL.revokeObjectURL(vidUrl);
    setVidFile(f); setVidUrl(URL.createObjectURL(f));
    if (!poster) {
      const shot = await captureFrame(f);
      if (shot) setPoster(p => p ?? { file: shot, url: URL.createObjectURL(shot), label: '从视频截取的缩略图' });
    }
  };
  /** 링크 — 유튜브면 썸네일이 비어 있을 때 유튜브 썸네일을 넣어 둔다 */
  const setLink = (v: string) => {
    setVidLink(v);
    const emb = v.trim() ? videoEmbed(v.trim()) : null;
    if (emb?.thumb && !poster) setPoster({ ref: emb.thumb, label: 'YouTube 缩略图' });
  };
  const pickPoster = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('请选择图片文件'); return; }
    setPoster({ file: f, url: URL.createObjectURL(f), label: f.name });
  };

  const post = async () => {
    if (!title.trim()) { toast('请输入标题'); return; }
    let video: string | undefined;
    if (vidMode === 'link') {
      video = vidLink.trim();
      if (!/^https?:\/\//.test(video)) { toast('视频链接必须以 https:// 开头'); return; }
    } else {
      if (!vidFile && !vidRef) { toast('请选择视频文件'); return; }
      video = vidFile ? await putBlob(vidFile) : vidRef!;
    }
    const posterId = poster ? (poster.file ? await putBlob(poster.file) : poster.ref) : undefined;
    const tags = parseTags(tagsText);
    if (isNew) {
      const p: VideoPost = {
        id: newId(), title: title.trim(), video, poster: posterId, desc, tags, category: category || undefined,
        date: new Date().toISOString(), author: user.nickname, authorId: user.id, visibility,
        ...secStamp(sec.id),
      };
      setPosts([p, ...posts]);
      toast('已发布');
      router.push(`/videos/${p.id}`);
    } else {
      setPosts(posts.map(x => (x.id === initial.id
        ? { ...x, title: title.trim(), video: video!, poster: posterId, desc, tags, category: category || undefined, visibility }
        : x)));
      toast('已保存');
      router.push(`/videos/${initial.id}`);
    }
  };

  const linkEmb = /^https?:\/\//.test(vidLink.trim()) ? videoEmbed(vidLink.trim()) : null;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k={isNew ? 'videos-write-desc' : 'videos-edit-desc'} def={isNew ? '上传视频 — 可选择一个文件或填写链接' : '编辑视频内容'} />
      </div>
      <div className="write-grid">
        {/* 좌: 본문 */}
        <div className="panel" style={{ padding: 24 }}>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>标题</label>
            <KInput value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          </div>
          <label className="k-label">视频</label>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <KRadio name="vmode" value="file" current={vidMode} onChange={() => setVidMode('file')} label="上传文件" />
            <KRadio name="vmode" value="link" current={vidMode} onChange={() => setVidMode('link')} label="链接（YouTube、Vimeo 或视频文件地址）" />
          </div>
          {vidMode === 'file' ? (
            <>
              <div className="upzone" onClick={() => document.getElementById('vdFile')?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); void pickVideo(e.dataTransfer.files); }}>
                <b style={{ display: 'block', marginBottom: 3 }}>
                  {vidFile ? `${vidFile.name} · ${fmtSize(vidFile.size)}` : vidRef ? '已保存的视频 — 选择新文件以替换' : '将视频拖放到此处，或点击选择'}
                </b>
                一个 mp4、webm 或 mov 文件{isServerMode() ? ' · 服务器上限 20MB（较大文件请使用链接）' : ''}
              </div>
              <input id="vdFile" type="file" accept="video/*" style={{ display: 'none' }}
                onChange={e => { void pickVideo(e.target.files); e.target.value = ''; }} />
              {(vidUrl || savedVidUrl) && (
                <div className="vid-pv">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={vidUrl ?? savedVidUrl} controls playsInline preload="metadata" />
                </div>
              )}
            </>
          ) : (
            <>
              <KInput value={vidLink} onChange={e => setLink(e.target.value)}
                placeholder="https://youtu.be/… 或 .mp4 / .mov 文件地址" style={{ marginBottom: 10 }} />
              {linkEmb && (
                <div className="vid-pv">
                  {linkEmb.kind !== 'file'
                    ? <iframe src={linkEmb.url} title="preview" allow="encrypted-media; picture-in-picture" allowFullScreen />
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    : <video src={linkEmb.url} controls playsInline preload="metadata" />}
                </div>
              )}
            </>
          )}

          <label className="k-label">缩略图（选填）</label>
          <div className="upzone" style={{ padding: '16px 20px' }} onClick={() => document.getElementById('vdPoster')?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pickPoster(e.dataTransfer.files); }}>
            {poster ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                <PosterPreview p={poster} />
                <span style={{ textAlign: 'left' }}>
                  <b style={{ display: 'block' }}>{poster.label}</b>
                  点击以更换 · <span className="lnk" style={{ color: 'var(--accent)' }}
                    onClick={e => { e.stopPropagation(); setPoster(null); }}>移除</span>
                </span>
              </div>
            ) : (
              <>
                <b style={{ display: 'block', marginBottom: 3 }}>选择缩略图图片 — 留空时会从视频中截取一帧</b>
                用于列表和播放前的预览画面
              </>
            )}
          </div>
          <input id="vdPoster" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { pickPoster(e.target.files); e.target.value = ''; }} />

          <div style={{ marginTop: 14 }}>
            <label className="k-label">说明</label>
            <RichEditor value={desc} onChange={setDesc} placeholder="请输入视频说明（选填）" />
          </div>
        </div>

        {/* 우: 설정 */}
        <div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>设置</h4>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>标签</label>
              <KInput value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="使用逗号分隔" style={{ flex: 1 }} />
            </div>
            {/* 말머리 (커플홈) — 환경설정 「게시판」의 비디오 말머리. 하나도 없으면 칸을 두지 않는다 */}
            {(videoCats.length > 0 || category) && (
              <div className="form-row">
                <label className="k-label" style={{ width: 70 }}>分类</label>
                <KSelect minWidth={120} value={category} onChange={setCategory}
                  options={[
                    { value: '', label: '无分类' },
                    ...videoCats.map(c => ({ value: c.label, label: c.label })),
                    ...(category && !videoCats.some(c => c.label === category) ? [{ value: category, label: `${category}（列表中不存在）` }] : []),
                  ]} />
              </div>
            )}
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>可见范围</label>
              <KSelect minWidth={120} value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '公开' },
                  { value: 'member', label: '成员可见' },
                  { value: 'private', label: '仅自己可见' },
                ]} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-onbk" onClick={() => router.push(isNew ? tt.href : `/videos/${initial.id}`)}>取消</button>
            <button className="btn btn-accent" onClick={post}>{isNew ? '发布' : '保存'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
