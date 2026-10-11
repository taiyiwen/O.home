'use client';
// 캐릭터 등록/프로필 편집 — 전용 페이지 폼 (4.4)
// 모달이 아니라 페이지라 잘못 클릭해도 닫히지 않음. 탭 내용은 별도 편집 화면으로 전환해 작성.
// 아트는 여러 장 — 첫 장이 대표 풀 아트이자 리스트 썸네일(3:4 크롭) 원본 (6.1)
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Character, CharTab, ColorChip, Visibility, CharGrant } from '@/lib/charStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { newId } from '@/lib/postStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { KInput, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { SymbolInput } from '@/components/ui/SymbolInput';
import { fileDrop } from '@/lib/dnd';
import { isValidSlug, slugify } from '@/lib/link';
import { useToast } from '@/components/ui/Toast';
import { Lightbox } from '@/components/ui/Lightbox';

interface SpecRow { id: string; label: string; value: string }
interface ColorRow extends ColorChip { id: string }
interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function CharEditForm({ initial, onSave, onCancel, auMode, existingIds }: {
  initial: Character | null;               // null = 신규 등록
  onSave: (c: Character) => void;
  onCancel: () => void;
  auMode?: boolean;                        // AU 전용 편집 (v1.9) — 공개범위·회원권한은 base 소관이라 숨김
  existingIds?: string[];                  // 페이지 주소 중복 검사용 (v1.9 — 신규 등록)
}) {
  const { fonts, familyOf } = useFonts();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const isNew = !initial;

  const [name, setName] = useState(initial?.name ?? '');
  // 페이지 주소 /chars/{slug} — 신규는 비우면 자동(id). 수정에서도 바꿀 수 있다 (v2.0 사용자 요청):
  // id는 그대로 두고 별명(slug)만 저장하므로 참조가 끊어지지 않고 옛 주소도 계속 열린다
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sub, setSub] = useState(initial?.sub ?? '');
  const [color, setColor] = useState(initial?.color ?? '#5d636d');
  const [themeMode, setThemeMode] = useState<'default' | 'custom'>(initial?.themeMode ?? 'default');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [fontId, setFontId] = useState(initial?.fontId ?? 'serif');
  const [nameSize, setNameSize] = useState(initial?.nameSize ?? 38);   // 상세 큰 이름 크기 (v2.0)
  const [nameBold, setNameBold] = useState(initial?.nameBold ?? true); // 상세 이름 볼드 (v2.0 — 기본 켜짐)
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [specs, setSpecs] = useState<SpecRow[]>(
    (initial?.specs ?? [{ label: '성별', value: '' }, { label: '키', value: '' }]).map(s => ({ ...s, id: newId() })));
  const [colors, setColors] = useState<ColorRow[]>((initial?.colors ?? []).map(c => ({ ...c, id: newId() })));
  const [colorTipMode, setColorTipMode] = useState<'hex' | 'both' | 'label'>(initial?.colorTipMode ?? 'hex');
  // 색 점 테두리 (v2.0 사용자 요청) — 없음 / 1px(색 지정). 미지정이면 지금까지의 옅은 테두리
  const [colorBd, setColorBd] = useState<string | undefined>(initial?.colorBd);
  const [basicHtml, setBasicHtml] = useState(initial?.basicHtml ?? '');
  const [tabs, setTabs] = useState<CharTab[]>(initial?.tabs ?? []);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = initial?.arts ?? (initial?.artId ? [initial.artId] : initial?.thumbId ? [initial.thumbId] : []);
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [grants, setGrants] = useState<CharGrant[]>(initial?.grants ?? []); // 상대 캐릭터 회원 권한 (v1.9)
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 아트 썸네일 클릭 → 원본 보기
  // 화면 전환: 메인 폼 / 탭 전용 편집 화면
  const [view, setView] = useState<'main' | string>('main');

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 첫 장 → 썸네일 크롭 (6.1)
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('请输入姓名'); return; }
    // 페이지 주소 (v1.9 / 수정도 가능 v2.0) — 유효성·중복 검사
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('地址只能包含小写英文字母、数字和连字符'); return; }
      if (existingIds?.includes(slug)) { toast('此地址已被使用，请输入其他地址'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      id: initial?.id ?? (slug || newId()),
      // 수정에서 정한 주소는 별명으로 (v2.0) — 신규는 주소가 곧 id라 따로 남기지 않는다
      slug: !isNew ? (slug.trim() || undefined) : undefined,
      // 입력한 그대로 저장 — 예전에는 대문자로 바꿔 저장해서 소문자 이름을 쓸 수 없었다
      name: name.trim(),
      sub: sub.trim(),
      color,
      themeMode,
      colors: colors.filter(x => x.hex).map(({ hex, label }) => ({ hex, label })),
      colorTipMode,
      colorBd,
      specs: specs.filter(s => s.label.trim()).map(({ label, value }) => ({ label: label.trim(), value })),
      tabs,   // 제목이 비어도 유지 — 필터로 사라지던 버그 수정 (v1.9 사용자 지적)
      basicHtml,
      visibility,
      fontId,
      nameSize,
      nameBold,
      bodyFontId,
      thumbClass: initial?.thumbClass ?? '',
      arts: artIds,
      thumbId: artIds[0],       // 썸네일 = 첫 아트 + 크롭
      thumbCrop,
      artId: artIds[0],
      own: initial?.own ?? true,
      grants: grants.length ? grants : undefined,
    });
  };

  const rowInp: React.CSSProperties = { fontSize: 12, padding: '7px 10px' };
  const addBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 11, justifySelf: 'center' };

  // 탭 삭제 — 경고 모달을 거침 (v1.9)
  const del = useConfirmDelete();
  const askDeleteTab = (tabId: string, after?: () => void) => {
    const t = tabs.find(x => x.id === tabId);
    del.ask(`确定删除标签页“${t?.title || '无标题'}”吗？`, () => {
      setTabs(l => l.filter(x => x.id !== tabId));
      after?.();
    }, '此标签页中的内容也会一并删除。保存前离开表单可撤销更改。');
  };

  /* ---------- 탭 전용 편집 화면 ---------- */
  const curTab = tabs.find(t => t.id === view);
  if (curTab) {
    return <>
      <TabEditView
        tab={curTab}
        onChange={patch => setTabs(l => l.map(x => (x.id === curTab.id ? { ...x, ...patch } : x)))}
        onDelete={() => askDeleteTab(curTab.id, () => setView('main'))}
        onBack={() => setView('main')} />
      {del.element}
    </>;
  }

  /* ---------- 메인 폼 ---------- */
  return (
    <div className="write-grid">
      {/* 좌: 아트/스펙/컬러/본문/탭 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        {/* 아트 목록 */}
        <label className="k-label" style={{ margin: 0 }}>
          插画 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 第一张为主图，列表缩略图从第一张按 3:4 裁剪；拖动 ⠿ 调整顺序</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="点击查看原图" onClick={() => setLb(i)}
                  style={{ width: 64, aspectRatio: '3/4', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">主图 · 缩略图</span>
                    {/* 옆의 「대표 · 썸네일」 뱃지와 세로 크기 통일 (23px).
                        상세 화면에 보일 위치는 상세에서 우클릭으로 잡는다 (v2.0) */}
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, lineHeight: '13px' }}
                      onClick={() => setCropOpen(true)}>✂ 裁剪缩略图</button>
                  </>
                ) : (
                  <span className="pill">其他插画</span>
                )}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('确定删除此插画吗？', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="chArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => document.getElementById('chArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ 添加插画 {arts.length === 0 && '（添加第一张图片时可设置缩略图裁剪）'}
        </button>

        {/* 기본 정보 스펙 */}
        <label className="k-label" style={{ margin: 0 }}>基本信息项目</label>
        <DragList items={specs} keyOf={s => s.id} onReorder={setSpecs}
          render={s => (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', padding: '2px 0' }}>
              <span className="drag-h">⠿</span>
              <KInput placeholder="项目" value={s.label} style={{ ...rowInp, width: 90 }}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, label: e.target.value } : x))} />
              <KInput placeholder="内容" value={s.value} style={rowInp}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, value: e.target.value } : x))} />
              <span className="fx" onClick={() => {
                const remove = () => setSpecs(l => l.filter(x => x.id !== s.id));
                if (s.label.trim() || s.value.trim()) del.ask('确定删除此项目吗？', remove, `${s.label} — ${s.value}`);
                else remove();
              }}>✕</span>
            </div>
          )} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setSpecs(l => [...l, { id: newId(), label: '', value: '' }])}>＋ 添加项目</button>

        {/* 테마 컬러 — 한 줄에 2개 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label className="k-label" style={{ margin: 0 }}>主题色（显示为资料页色点）</label>
          <div className="mini-seg" data-tip="色点悬停提示的显示方式">
            <button className={colorTipMode === 'hex' ? 'on' : ''} onClick={() => setColorTipMode('hex')}>hex</button>
            <button className={colorTipMode === 'both' ? 'on' : ''} onClick={() => setColorTipMode('both')}>名称+hex</button>
            <button className={colorTipMode === 'label' ? 'on' : ''} onClick={() => setColorTipMode('label')}>仅名称</button>
          </div>
          {/* 색 점 테두리 (v2.0 사용자 요청) — 안 정하면 지금까지의 옅은 테두리 그대로 */}
          <div className="mini-seg" data-tip="色点边框">
            <button className={colorBd === undefined ? 'on' : ''} onClick={() => setColorBd(undefined)}>默认</button>
            <button className={colorBd === 'none' ? 'on' : ''} onClick={() => setColorBd('none')}>无</button>
            <button className={colorBd !== undefined && colorBd !== 'none' ? 'on' : ''}
              onClick={() => setColorBd(c => (c && c !== 'none' ? c : '#1d2025'))}>1px</button>
          </div>
          {colorBd !== undefined && colorBd !== 'none' && (
            <ColorField value={colorBd} onChange={setColorBd} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
          {colors.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
              <ColorField value={c.hex} onChange={hex => setColors(l => l.map(x => x.id === c.id ? { ...x, hex } : x))} />
              <KInput placeholder="名称" value={c.label} style={{ ...rowInp, flex: 1, minWidth: 50 }}
                onChange={e => setColors(l => l.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))} />
              <span className="fx" onClick={() => del.ask('确定删除此颜色吗？', () => setColors(l => l.filter(x => x.id !== c.id)), c.label || c.hex)}>✕</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setColors(l => [...l, { id: newId(), hex: '#888888', label: '' }])}>＋ 添加颜色</button>

        {/* 기본 소개 본문 — 리치 에디터 */}
        <label className="k-label" style={{ margin: 0 }}>基本信息介绍</label>
        <RichEditor value={basicHtml} onChange={setBasicHtml}
          placeholder="请输入角色介绍，可插入图片（不允许脚本）" />

        {/* 추가 탭 — 목록만, 내용은 전용 화면에서 */}
        <label className="k-label" style={{ margin: 0 }}>其他标签页 — 点击“编辑”进入专用页面填写内容</label>
        {tabs.map(t => (
          <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: '#eef0f2', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
            <b style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '（无标题）'}</b>
            {t.subtitle && <small style={{ color: 'var(--faint)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subtitle}</small>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5, flexShrink: 0 }}>{t.html ? `${t.html.length.toLocaleString()} 字` : '空'}</small>
            <button className="btn btn-dark" style={{ marginLeft: 'auto', height: 27, padding: '0 12px', fontSize: 11 }}
              onClick={() => setView(t.id)}>编辑 ›</button>
            <span className="fx" onClick={() => askDeleteTab(t.id)}>✕</span>
          </div>
        ))}
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => {
            const id = newId();
            setTabs(l => [...l, { id, icon: '✦', title: '', html: '' }]);
            setView(id); // 바로 전용 편집 화면으로
          }}>＋ 添加标签页</button>

        {/* 회원 권한 — 역극 플레이 / 편집까지 (3차 회원-캐릭터 연결, v1.9) — AU 편집에선 base 소관.
            **관리자만** (v2.0 사용자 확정) — 편집 권한을 받은 회원이 이 화면에 들어와도
            권한 관리는 못 한다. 열어 두면 자기가 받은 권한으로 남에게 권한을 나눠 줄 수 있다.
            저장 시에는 기존 grants가 그대로 보존된다(이 화면에서 건드리지 않으므로).
            **own 여부와 무관하게** (v2.0 포크 제보) — 예전에는 상대 캐릭터(own=false)에만 떠서,
            상대방 캐릭터까지 정식 캐릭터로 직접 등록해 쓰는 홈에서는 권한을 줄 방법이 없었다.
            관리자 전용이 된 지금은 이 제한이 있을 이유가 없다 — 권한 판정(charGrant·역극 참여)은
            원래부터 own을 보지 않는다. */}
        {!auMode && isAdmin && (
          <>
            <label className="k-label" style={{ margin: '6px 0 0' }}>成员权限 — 角色互动和角色编辑</label>
            <GrantsEditor value={grants} onChange={setGrants} />
          </>
        )}
      </div>

      {/* 우: 기본 설정 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>基本设置</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="姓名" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId) }} />
            {/* 페이지 주소 (v1.9) — /chars/{slug}, 비우면 자동 · 중복이면 경고.
                수정에서도 바꿀 수 있다 (v2.0 사용자 요청) — 비우면 원래 주소(id) 그대로.
                AU 편집에서는 주소가 base 소관이라 숨긴다 */}
            {/* AU 편집에서는 이 AU 프로필의 주소 (커플홈 사용자 요청 — 「AU 프로필의 주소를 정할 수 없다」):
                /chars/{캐릭터}?au={여기}. 비우면 자관 AU의 주소 별명(없으면 키)을 그대로 쓴다 */}
            {auMode && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>?au=</span>
                  <KInput placeholder="AU 资料页地址（选填），留空则沿用关系 AU 地址" value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>此地址已被该角色的其他 AU 资料页使用</p>
                )}
              </div>
            )}
            {!auMode && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/chars/</span>
                  <KInput placeholder={isNew ? '页面地址（选填）' : `页面地址（留空则使用 ${initial?.id}）`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>此地址已被使用</p>
                )}
              </div>
            )}
            <KInput placeholder="一句话介绍（选填）" value={sub} onChange={e => setSub(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cp-lb">主要主题色</span>
              <ColorField value={color} onChange={setColor} />
            </div>
            {/* 상세 페이지 테마 (v1.9 사용자 확정) — 기존 테마 유지 / 대표 테마색으로 팔레트 전환 */}
            <div className="mini-seg">
              <button className={themeMode === 'default' ? 'on' : ''} onClick={() => setThemeMode('default')}>沿用当前主题</button>
              <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>角色主题色</button>
            </div>
            {/* 공개범위는 base 소관 — AU 편집에선 숨김 (v1.9) */}
            {!auMode && (
              <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '公开' },
                  { value: 'member', label: '成员可见' },
                  { value: 'private', label: '仅自己可见' },
                ]} />
            )}
            {/* 설명은 드롭다운 **위에** (v2.0 사용자 요청 — 자관 폼과 같은 배치) */}
            <p className="hint" style={{ margin: '2px 0 0' }}>姓名字体 — 应用于列表和详情页姓名</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
            {/* 이름 길이가 제각각이라 자동으로 줄이면 어중간해진다 — 캐릭터마다 직접 정한다 (v2.0) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="k-label" style={{ margin: 0, flex: 1 }}>详情页姓名大小</span>
              {/* 폰트에 따라 볼드가 어색한 경우가 있어 끌 수 있게 (v2.0 사용자 요청) — 기본은 지금까지처럼 볼드 */}
              <KCheck label="Bold" checked={nameBold} onChange={setNameBold} />
              <KStep value={nameSize} onChange={setNameSize} min={14} max={72} step={1} suffix="px" />
            </div>
            <p className="hint" style={{ margin: '2px 0 0' }}>正文字体 — 应用于资料信息和介绍</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>取消</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? '添加' : '保存'}
          </button>
        </div>
      </div>

      {/* 썸네일 크롭 (3:4 — 첫 아트 기준, 6.1) */}
      {arts[0] && (
        <FirstArtCrop open={cropOpen} item={arts[0]} crop={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
      {/* 아트 원본 보기 — 아직 저장 전 파일은 url, 저장된 것은 ref (Lightbox가 둘 다 처리) */}
      {lb !== null && (
        <Lightbox srcs={arts.map(a => a.url ?? a.ref ?? '')} index={lb} onClose={() => setLb(null)} />
      )}
      {del.element}
    </div>
  );
}

/* ---------- 탭 전용 편집 화면 — 큰 에디터 + 실시간 미리보기 ---------- */
function TabEditView({ tab, onChange, onDelete, onBack }: {
  tab: CharTab;
  onChange: (patch: Partial<CharTab>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="panel" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={onBack}>‹ 返回</button>
        <b style={{ fontSize: 14 }}>编辑标签页</b>
        <span className="hint" style={{ margin: 0 }}>此页面的内容会在保存资料时一并保存</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={onDelete}>删除标签页</button>
      </div>
      {/* 아이콘 + Title/Subtitle 한 줄 — Subtitle은 제목 아래 작은 글씨 (없으면 표시 안 됨) */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* 아이콘 — 클릭하면 특수문자 프리셋, 직접 입력도 가능 (v1.9) */}
        <SymbolInput value={tab.icon} maxLength={2} style={{ width: 56, textAlign: 'center' }}
          onChange={v => onChange({ icon: v })} />
        <KInput placeholder="标签页标题" value={tab.title}
          onChange={e => onChange({ title: e.target.value })} />
        <KInput placeholder="副标题（选填）" value={tab.subtitle ?? ''}
          onChange={e => onChange({ subtitle: e.target.value })} />
      </div>
      {/* 리치 에디터 (TipTap) — 툴바로 서식·이미지 삽입, 출력은 HTML */}
      <RichEditor value={tab.html} onChange={html => onChange({ html })}
        placeholder="请输入标签页内容，可插入图片（不允许脚本）" />
      <button className="btn btn-dark" style={{ justifySelf: 'end' }} onClick={onBack}>完成，返回列表</button>
    </div>
  );
}

/** 첫 아트(새 파일 또는 저장된 blob)를 소스로 3:4 크롭 편집기 표시 */
function FirstArtCrop({ open, item, crop, onClose, onApply }: {
  open: boolean; item: ArtItem; crop?: CropValue;
  onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState('');
  useEffect(() => {
    if (item.url || !item.ref || !open) return;
    getBlob(item.ref).then(b => { if (b) setLoadedUrl(URL.createObjectURL(b)); });
  }, [item, open]);
  const src = item.url || loadedUrl;
  if (!src || !open) return null;
  return <CropEditor open={open} src={src} aspect="3:4" initial={crop} onClose={onClose} onApply={onApply} />;
}

