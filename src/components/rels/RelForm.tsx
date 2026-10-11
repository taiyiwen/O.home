'use client';
// 자관 등록/수정 공용 폼 (4.5) — 유형(페어/다인) · 이름/본문 폰트 · 캐치프레이즈 · 공개범위 ·
// 아트 다중 등록(첫 장 = 대표 · 리스트 썸네일 4:3 크롭) · 등록 시 내 캐릭터 연동
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Character, Relation, Visibility, RelCpTag, RelMember, auMember, auStyle, fullShadow } from '@/lib/charStore';
import { ColorField } from '@/components/ui/ColorField';
import { isValidSlug, slugify } from '@/lib/link';
import { CP_LABEL } from '@/lib/relqStore';
import { newId } from '@/lib/postStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { KInput, KSelect, KCheck, KStep } from '@/components/ui/Kit';
import { HEADER_BLUR_DEFAULT } from '@/lib/charStore';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { Lightbox } from '@/components/ui/Lightbox';
import { useConfirmDelete } from '@/components/ui/Modal';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';

export interface RelFormValue {
  slug?: string;             // 페이지 주소 /rels/{slug} (v1.9 — 신규 등록 시, 비우면 자동 id)
  name: string;
  catchphrase: string;
  kind: 'pair' | 'multi';
  visibility: Visibility;
  fontId: string;
  bodyFontId: string;
  titleSize?: number;        // 자관명 크기 px (커플홈)
  titleBold?: boolean;       // 자관명 굵게 (커플홈)
  arts: string[];            // 첫 장 = 대표 = 리스트 썸네일 원본
  thumbCrop?: CropValue;
  headerImgId?: string;      // 헤더 이미지 (v1.5 — 풀폭 블러 + 페이드아웃)
  headerCrop?: CropValue;    // 헤더 위치 크롭 (원본 무손실)
  headerRemoved?: boolean;   // 헤더 제거 상태 (v1.9 — AU 편집에서 "없음 명시" 저장용)
  headerBlur?: number;       // 헤더 흐림 px (커플홈 사용자 요청) — 0이면 흐리지 않음
  themeFollow?: boolean;     // AU 편집: true면 기존(base) 페이지 테마 따라가기 (v1.9)
  illuBg?: string;           // 전신/일러 스위치 배경색 (v1.9 — 미지정: 테마)
  illuOn?: string;           // 전신/일러 스위치 선택색 (미지정: 포인트색)
  nameColor?: string;        // 자관명(히어로 타이틀) 글씨색 (v1.9 사용자 요청 — 미지정: 테마)
  cpColor?: string;          // 캐치프레이즈 글씨색 (미지정: 테마)
  cpTagBg?: string;          // CP/NCP 뱃지 배경색 (v2.0 사용자 요청)
  cpTagFg?: string;          // CP/NCP 뱃지 글씨색
  nameShadowColor?: string;  // 자관명 그림자 색 (v2.0 사용자 요청)
  nameShadow?: number;       // 자관명 그림자 강도 %
  headerBgG1?: string;       // 헤더 이미지 없을 때 배경 그라데이션 (v2.0 사용자 요청)
  headerBgG2?: string;
  headerBgAngle?: number;
  pageBgG1?: string;         // 페이지 전체 배경 그라데이션 (v2.0 사용자 요청)
  pageBgG2?: string;
  pageBgAngle?: number;
  themeMode: 'site' | 'custom'; // 페이지 테마 — 홈페이지 그대로 / 별도 테마컬러 (4.18 방식)
  themeColor?: string;          // 별도 테마컬러 (custom일 때)
  themeTone?: 'dark' | 'light'; // 테마컬러의 다크/라이트 느낌
  cp: RelCpTag;              // CP/NCP (v1.9) — AU별로는 AU 관리에서 따로 지정
  cpText?: string;           // CP 뱃지 문구 (커플홈) — 비우면 CP/NCP
  fulls?: Record<string, string | undefined>;  // 멤버별 전신 이미지 (v1.9 — charId → blob id)
  fullScales?: Record<string, number>;         // 전신 크기 % (휠 조절)
  fullOffsets?: Record<string, { x: number; y: number }>; // 전신 위치 오프셋 % (드래그, v1.9)
  quotes?: Record<string, string>;                              // 히어로 좌/우 한마디 문구 (v2.0)
  names?: Record<string, string>;                               // 이 AU에서 부르는 이름 (커플홈 — AU 편집일 때만)
  nameSizes?: Record<string, number>;                           // 멤버 카드 이름 크기 px (v2.0)
  nameBolds?: Record<string, boolean>;                          // 멤버 카드 이름 볼드 (v2.0 — 기본 켜짐)
  quoteColors?: Record<string, { fg?: string; mark?: string }>; // 히어로 대사 글씨/따옴표색 (페어, v1.9)
  fullFront?: string;                          // 앞에 보일 캐릭터 id
  auName?: string;           // AU별 자관명 (v2.0 사용자 요청 — AU 편집일 때만)
  auSlug?: string;           // AU 페이지 주소 별명 (커플홈 — AU 편집일 때만) /rels/{자관}?au={slug}
  qaHide?: boolean;          // 문답 답변 숨기기 (v2.0 사용자 요청)
  pickedCharIds: string[];   // 등록 시 연동할 내 캐릭터 (수정 모드에선 빈 배열)
}

interface FullDraft { ref?: string; file?: File; url?: string }

/** 전신 미리보기 한 장 (v1.9 조작 개편 — 사용자 확정)
 *  · 드래그 = 위치 이동 (가로·세로)  · 휠 = 크기 (비율 유지)  · 우클릭 = 앞으로/뒤로 메뉴
 *  배치는 상세 FullImg와 동일(부모 fb 박스 기준 하단 중앙 + 오프셋) — 미리보기 = 실제 */
function FullPrevImg({ draft, scale, offX, offY, name, shadow, onScale, onOffset, onLayer }: {
  draft?: FullDraft; scale: number; offX: number; offY: number; name: string; shadow?: string;
  onScale: (v: number) => void;
  onOffset: (x: number, y: number) => void;
  onLayer: (front: boolean) => void;
}) {
  const loaded = useBlobUrl(draft?.ref);
  const src = draft?.url ?? loaded;
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number; bw: number; bh: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  // 휠 = 크기 — React onWheel은 passive라 preventDefault가 무시되어 페이지가 같이 스크롤됨 (v1.9 수정)
  // → 네이티브 리스너를 {passive:false}로 등록해 이미지 위에서는 기본 휠 차단
  const imgRef = React.useRef<HTMLImageElement>(null);
  const wheelState = React.useRef({ scale, onScale });
  wheelState.current = { scale, onScale };
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: s, onScale: fn } = wheelState.current;
      fn(Math.max(40, Math.min(160, Math.round(s - Math.sign(e.deltaY) * 4))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={name}
        style={{
          position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
          height: `${scale}%`, maxWidth: 'none', cursor: 'var(--cur-grab,grab)',
          userSelect: 'none', touchAction: 'none',
          filter: shadow,
        }}
        draggable={false}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, ox: offX, oy: offY, bw: box.width, bh: box.height };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const nx = d.ox + ((e.clientX - d.x) / d.bw) * 100;
          const ny = d.oy - ((e.clientY - d.y) / d.bh) * 100;
          onOffset(Math.max(-80, Math.min(80, Math.round(nx))), Math.max(-60, Math.min(80, Math.round(ny))));
        }}
        onPointerUp={() => { drag.current = null; }}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }} />
      {menu && createPortal(
        <div style={{
          position: 'fixed', left: menu.x, top: menu.y, zIndex: 130,
          background: 'var(--panel-solid,#fff)', border: '1px solid var(--line)', borderRadius: 9,
          boxShadow: 'var(--sh-dd)', padding: 4, display: 'grid', minWidth: 92,
        }} onMouseDown={e => e.stopPropagation()}>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(true); setMenu(null); }}>置于前方</button>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(false); setMenu(null); }}>置于后方</button>
        </div>,
        document.body,
      )}
    </>
  );
}

interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function RelForm({ initial, auId, myChars, memberNames, existingIds, onSave, onCancel, onNewChar }: {
  initial: Relation | null;          // null = 신규 등록
  auId?: string;                     // AU 편집 모드 (v1.9) — 아트·캐치프레이즈·전신이 이 AU의 것
  myChars: Character[];
  memberNames?: Record<string, string>;  // 멤버 charId → 이름 (전신 섹션 표기)
  existingIds?: string[];            // 페이지 주소 중복 검사용 (v1.9 — 신규 등록)
  onSave: (v: RelFormValue) => void;
  onCancel: () => void;
  /** 캐릭터 새로 만들기 (커플홈) — 캐릭터 목록 페이지가 없으므로 등록 화면에서 바로 간다 */
  onNewChar?: () => void;
}) {
  const toast = useToast();
  const del = useConfirmDelete();   // 삭제 확인 모달 (v1.9 — 아트·전신)
  const { fonts, familyOf } = useFonts();
  const isNew = !initial;
  const auObj = auId ? initial?.aus.find(a => a.id === auId) : undefined;

  const [kind, setKind] = useState<'pair' | 'multi'>(initial?.kind ?? 'pair');
  const [name, setName] = useState(initial?.name ?? '');
  // 페이지 주소 /rels/{slug} — 신규는 비우면 자동(id). 수정에서도 바꿀 수 있다 (v2.0 사용자 요청)
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [catchphrase, setCatchphrase] = useState(auObj ? auObj.catchphrase : (initial?.catchphrase ?? ''));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [cp, setCp] = useState<RelCpTag>(initial?.cp ?? 'cp');   // CP/NCP (v1.9)
  // CP 뱃지 문구 (커플홈 사용자 요청) — AU 편집이면 그 AU 문구, 없으면 자관 기본. 비우면 CP/NCP
  const [cpText, setCpText] = useState((auObj?.cpText ?? initial?.cpText) ?? '');
  // AU 편집이면 그 AU에 정한 폰트부터 (v2.0 사용자 제보 — AU 폰트가 분리되지 않던 것)
  const [fontId, setFontId] = useState((auObj?.fontId ?? initial?.fontId) ?? 'serif');
  // 자관명 크기·굵게 (커플홈 사용자 요청) — AU 편집이면 그 AU 값, 없으면 자관 기본
  const [titleSize, setTitleSize] = useState((auObj?.titleSize ?? initial?.titleSize) ?? 64);
  const [titleBold, setTitleBold] = useState((auObj?.titleBold ?? initial?.titleBold) ?? true);
  const [bodyFontId, setBodyFontId] = useState((auObj?.bodyFontId ?? initial?.bodyFontId) ?? 'default');
  const [picked, setPicked] = useState<string[]>([]);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = auObj ? (auObj.arts ?? []) : (initial?.arts ?? (initial?.thumbId ? [initial.thumbId] : []));
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 아트 썸네일 클릭 → 원본 보기
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerUrl, setHeaderUrl] = useState('');
  const [headerRemoved, setHeaderRemoved] = useState(false);
  // AU 편집 모드 — 그 AU의 헤더만 시작점 (base 것을 복사해오지 않음, v1.9 AU별 완전 분리)
  const initHeaderId = auObj ? (auObj.headerImgId ?? undefined) : initial?.headerImgId;
  const initHeaderCrop = auObj ? auObj.headerCrop : initial?.headerCrop;
  const [headerCrop, setHeaderCrop] = useState<CropValue | undefined>(initHeaderCrop);
  const [headerCropOpen, setHeaderCropOpen] = useState(false);
  // 헤더 흐림 정도 (커플홈 사용자 요청) — 0이면 흐리지 않음. AU 편집이면 그 AU 것, 없으면 기본값
  const [headerBlur, setHeaderBlur] = useState<number>((auObj ? auObj.headerBlur : initial?.headerBlur) ?? HEADER_BLUR_DEFAULT);
  // 페이지 테마 (v1.9 AU별) — AU 편집: 기존(base) 따라가기 또는 이 AU 전용 테마
  const [themeFollow, setThemeFollow] = useState<boolean>(auObj ? auObj.theme === undefined : false);
  const [themeMode, setThemeMode] = useState<'site' | 'custom'>(
    (auObj?.theme?.mode ?? initial?.themeMode) ?? 'site');
  const [themeColor, setThemeColor] = useState((auObj?.theme?.color ?? initial?.themeColor) ?? '#c9a86a');
  const [themeTone, setThemeTone] = useState<'dark' | 'light'>((auObj?.theme?.tone ?? initial?.themeTone) ?? 'dark');
  // 색·배경은 AU마다 따로 정할 수 있다 (v2.0 사용자 요청) — AU 편집 중이면 그 AU에 정해 둔 값부터 보고,
  // 정한 게 없으면 자관 값이 그대로 채워진다. 체크를 끄면 AU에서 지워져 자관 값으로 되돌아간다.
  const st = initial ? auStyle(initial, auObj) : undefined;
  // 전신/일러 스위치 색 (v1.9) — 직접 지정 안 하면 테마·포인트색
  const [illuCustom, setIlluCustom] = useState(!!(st?.illuBg || st?.illuOn));
  const [illuBg, setIlluBg] = useState(st?.illuBg ?? '#1d2025');
  const [illuOn, setIlluOn] = useState(st?.illuOn ?? '#a63a45');
  // 자관명·캐치프레이즈 글씨색 (v1.9 사용자 요청) — 직접 지정 안 하면 테마색
  const [txtCustom, setTxtCustom] = useState(!!(st?.nameColor || st?.cpColor));
  const [nameColor, setNameColor] = useState(st?.nameColor ?? '#e8eaee');
  const [cpColor, setCpColor] = useState(st?.cpColor ?? '#8a8f98');
  // CP/NCP 뱃지 색 (v2.0 사용자 요청) — 미지정이면 기본 pill 색
  const [tagCustom, setTagCustom] = useState(!!(st?.cpTagBg || st?.cpTagFg));
  const [cpTagBg, setCpTagBg] = useState(st?.cpTagBg ?? '#eef0f2');
  const [cpTagFg, setCpTagFg] = useState(st?.cpTagFg ?? '#5d636d');
  // 그림자 (v2.0) — 색·강도. 자관명과 전신 이미지에 함께 걸린다 (사용자 요청). 미지정이면 기존 그대로
  const [shadowCustom, setShadowCustom] = useState(!!(st?.nameShadowColor || st?.nameShadow));
  const [nameShadowColor, setNameShadowColor] = useState(st?.nameShadowColor ?? '#000000');
  const [nameShadow, setNameShadow] = useState(st?.nameShadow ?? 100);
  // 헤더 이미지가 없을 때 대신 깔 배경 그라데이션 (v2.0 사용자 요청) — 디자인 탭 배경 설정과 같은 방식(색 2개+각도)
  const [headerBgCustom, setHeaderBgCustom] = useState(!!(st?.headerBgG1 || st?.headerBgG2));
  const [headerBgG1, setHeaderBgG1] = useState(st?.headerBgG1 ?? '#3a4150');
  const [headerBgG2, setHeaderBgG2] = useState(st?.headerBgG2 ?? '#1a1d22');
  const [headerBgAngle, setHeaderBgAngle] = useState(st?.headerBgAngle ?? 180);
  // 페이지 전체 배경 (v2.0 사용자 요청) — 디자인 탭의 사이트 배경과 같은 방식(색 2개 + 각도)
  const [pageBgCustom, setPageBgCustom] = useState(!!(st?.pageBgG1 || st?.pageBgG2));
  const [pageBgG1, setPageBgG1] = useState(st?.pageBgG1 ?? '#2b3038');
  const [pageBgG2, setPageBgG2] = useState(st?.pageBgG2 ?? '#121418');
  const [pageBgAngle, setPageBgAngle] = useState(st?.pageBgAngle ?? 180);
  const [charQuery, setCharQuery] = useState('');
  // 전신 이미지 (v1.9 — 페어 · 수정 모드) — AU 편집이면 그 AU의 전신
  // 왼쪽 → 오른쪽 순서는 자관 상세와 같게 — 상세에서 좌우를 바꿨으면(pairRight) 그 자리대로 (커플홈 사용자 제보:
  // 좌우를 바꿔도 여기의 「왼쪽·오른쪽」 이름표와 전신 미리보기는 등록 순서 그대로였다)
  const pairMembers = (() => {
    if (isNew || !(initial!.kind ? initial!.kind === 'pair' : initial!.members.length === 2)) return [];
    const ms = initial!.members.slice(0, 2);
    const right = initial!.pairRight;
    return right && ms.some(m => m.charId === right)
      ? [...ms.filter(m => m.charId !== right), ...ms.filter(m => m.charId === right)]
      : ms;
  })();
  const [fulls, setFulls] = useState<Record<string, FullDraft>>(() => {
    const o: Record<string, FullDraft> = {};
    for (const m of pairMembers) {
      const ref = auObj ? auObj.fulls?.[m.charId] : m.fullImgId;
      if (ref) o[m.charId] = { ref };
    }
    return o;
  });
  // AU를 편집 중이면 그 AU에 정해 둔 값부터 본다 (v2.0 사용자 발견 — 예전엔 자관 공통 값만 봐서
  // AU에서 고친 게 다른 AU에도 그대로 나타났다). 정해 둔 게 없으면 자관 기본값.
  const mOf = (m: RelMember) => (auObj ? auMember(m, auObj) : m);
  const [fullScales, setFullScales] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).fullScale ?? 90])));
  // 전신 위치 오프셋 % (v1.9 — 드래그로 이동, 상세와 동일 좌표계)
  const [fullOffsets, setFullOffsets] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { x: mOf(m).fullOffX ?? 0, y: mOf(m).fullOffY ?? 0 }])));
  // 히어로 좌/우 한마디 — 색만 정할 수 있고 문구를 고칠 곳이 없었다 (v2.0 사용자 발견)
  const [quotes, setQuotes] = useState<Record<string, string>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).quote ?? ''])));
  // 이 AU에서 부르는 이름 (커플홈 사용자 요청) — AU 편집일 때만. 비우면 캐릭터 이름 그대로
  const [names, setNames] = useState<Record<string, string>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, auObj?.mset?.[m.charId]?.name ?? ''])));
  // 멤버 카드 이름 크기 (v2.0) — 카드 폭이 좁아 이름마다 알맞은 크기가 다르다
  const [nameSizes, setNameSizes] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameSize ?? 17])));
  // 이름 볼드 (v2.0 사용자 요청) — 폰트에 따라 볼드가 어색한 경우가 있어 끌 수 있게. 기본은 볼드
  const [nameBolds, setNameBolds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameBold ?? true])));
  // 히어로 대사 글씨/따옴표색 (페어, v1.9)
  const [quoteColors, setQuoteColors] = useState<Record<string, { fg?: string; mark?: string }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { fg: mOf(m).quoteColor, mark: mOf(m).quoteMarkColor }])));
  // AU별 자관명 (v2.0 사용자 요청) — 비우면 자관 이름 그대로
  const [auName, setAuName] = useState(auObj?.name ?? '');
  // AU 페이지 주소 별명 (커플홈 사용자 요청) — /rels/{자관}?au={slug}. 비우면 AU id
  const [auSlug, setAuSlug] = useState(auObj?.slug ?? '');
  // 문답 답변 가리기 (v2.0 사용자 요청) — 질문은 그대로 두고 답변 내용만
  const [qaHide, setQaHide] = useState(!!initial?.qaHide);
  // 전신 앞뒤도 AU별 (v2.0) — AU에서 바꾼 앞뒤가 원본·다른 AU를 건드리지 않게
  const [fullFront, setFullFront] = useState<string | undefined>(auObj?.fullFront ?? initial?.fullFront);

  // 내 캐릭터 연동 목록 — 선택된 캐릭터는 항상 표시, 나머지는 검색 필터 후 총 6명까지
  const q = charQuery.trim().toLowerCase();
  const pickedChars = myChars.filter(c => picked.includes(c.id));
  const restChars = myChars.filter(c =>
    !picked.includes(c.id) && (!q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)));
  const shownChars = [...pickedChars, ...restChars].slice(0, Math.max(6, pickedChars.length));
  const hiddenCount = pickedChars.length + restChars.length - shownChars.length;

  const maxPick = kind === 'pair' ? 2 : 6;

  const togglePick = (id: string, v: boolean) => {
    setPicked(list => {
      if (!v) return list.filter(x => x !== id);
      if (list.length >= maxPick) {
        toast(kind === 'pair' ? '配对关系最多可关联 2 个角色' : '多人关系最多可关联 6 个角色');
        return list;
      }
      return [...list, id];
    });
  };

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 첫 장 → 썸네일 크롭 (6.1)
      return [...prev, ...items];
    });
  };

  const save = async () => {
    // AU 주소 별명 (커플홈) — 형식 확인 + 같은 자관의 다른 AU와 겹치지 않게
    if (auObj && auSlug.trim()) {
      if (!isValidSlug(auSlug.trim())) { toast('AU 地址只能包含小写英文字母、数字和连字符'); return; }
      if (initial?.aus.some(a => a.id !== auObj.id && (a.slug === auSlug.trim() || a.id === auSlug.trim()))) {
        toast('此地址已被其他 AU 使用，请输入其他地址'); return;
      }
    }
    if (!name.trim()) { toast('请输入角色关系名称'); return; }
    // 페이지 주소 (v1.9 / 수정도 가능 v2.0) — 유효성·중복 검사
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('地址只能包含小写英文字母、数字和连字符'); return; }
      if (existingIds?.includes(slug)) { toast('此地址已被使用，请输入其他地址'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      // 수정에서 정한 주소는 별명으로 (v2.0) — 신규는 rels/new가 이 값을 id로 쓴다
      slug: slug.trim() || undefined,
      // 입력한 그대로 저장 (커플홈 사용자 요청 — 영문을 쓰면 무조건 대문자로 바뀌었다)
      name: name.trim(),
      catchphrase: catchphrase.trim(),
      kind, visibility, fontId, bodyFontId, titleSize, titleBold,
      arts: artIds,
      thumbCrop,
      headerImgId: headerFile ? await putBlob(headerFile) : (headerRemoved ? undefined : initHeaderId),
      headerCrop: headerRemoved ? undefined : headerCrop,
      headerBlur: headerRemoved ? undefined : headerBlur,
      headerRemoved,
      themeFollow,
      illuBg: illuCustom ? illuBg : undefined,
      illuOn: illuCustom ? illuOn : undefined,
      nameColor: txtCustom ? nameColor : undefined,
      cpColor: txtCustom ? cpColor : undefined,
      nameShadowColor: shadowCustom ? nameShadowColor : undefined,
      nameShadow: shadowCustom ? nameShadow : undefined,
      headerBgG1: headerBgCustom ? headerBgG1 : undefined,
      headerBgG2: headerBgCustom ? headerBgG2 : undefined,
      headerBgAngle: headerBgCustom ? headerBgAngle : undefined,
      pageBgG1: pageBgCustom ? pageBgG1 : undefined,
      pageBgG2: pageBgCustom ? pageBgG2 : undefined,
      pageBgAngle: pageBgCustom ? pageBgAngle : undefined,
      cpTagBg: tagCustom ? cpTagBg : undefined,
      cpTagFg: tagCustom ? cpTagFg : undefined,
      themeMode,
      themeColor: themeMode === 'custom' ? themeColor : undefined,
      themeTone: themeMode === 'custom' ? themeTone : undefined,
      cp, cpText: cpText.trim() || undefined,
      auName: auObj ? auName.trim() : undefined,
      auSlug: auObj ? auSlug.trim() : undefined,
      qaHide: qaHide || undefined,
      fulls: pairMembers.length
        ? Object.fromEntries(await Promise.all(pairMembers.map(async m => {
          const d = fulls[m.charId];
          return [m.charId, d ? (d.file ? await putBlob(d.file) : d.ref) : undefined] as const;
        })))
        : undefined,
      fullScales: pairMembers.length ? fullScales : undefined,
      fullOffsets: pairMembers.length ? fullOffsets : undefined,
      quotes: pairMembers.length ? quotes : undefined,
      names: auObj && pairMembers.length ? names : undefined,
      nameSizes: pairMembers.length ? nameSizes : undefined,
      nameBolds: pairMembers.length ? nameBolds : undefined,
      quoteColors: pairMembers.length ? quoteColors : undefined,
      fullFront,
      pickedCharIds: picked,
    });
  };

  return (
    <div className="write-grid">
      {/* 좌: 유형 · 내 캐릭터 연동(등록 시) · 아트 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <label className="k-label">类型</label>
          {isNew ? (
            <div className="mini-seg">
              <button className={kind === 'pair' ? 'on' : ''} onClick={() => { setKind('pair'); setPicked(p => p.slice(0, 2)); }}>
                配对（2 人）
              </button>
              <button className={kind === 'multi' ? 'on' : ''} onClick={() => setKind('multi')}>
                多人关系（3 人及以上）
              </button>
            </div>
          ) : (
            /* 등록 후에는 유형 변경 불가 (v1.9) — 레이아웃·데이터 구조가 달라 전환 시 애매해짐 */
            <span className="pill dark">{kind === 'pair' ? '配对（2 人）' : '多人关系（3 人及以上）'}</span>
          )}
          <p className="hint">
            {kind === 'pair'
              ? '左右角色卡 + 中央插画（全身图叠放/单张插画）布局'
              : '成员列表布局 · 最多 6 人'}
          </p>
        </div>

        {isNew && (
          <div>
            <label className="k-label">关联我的角色 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 已选 {picked.length}/{maxPick} 人</span></label>
            {myChars.length > 6 && (
              <KInput placeholder="搜索角色" value={charQuery} onChange={e => setCharQuery(e.target.value)}
                style={{ marginBottom: 8 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {shownChars.map(c => (
                <div key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: `1.5px solid ${picked.includes(c.id) ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 8, transition: '.15s',
                  }}>
                  <KCheck checked={picked.includes(c.id)} onChange={v => togglePick(c.id, v)}
                    label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <i style={{ width: 11, height: 11, borderRadius: '50%', background: c.color, fontStyle: 'normal' }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}</small>
                    </span>} />
                </div>
              ))}
              {myChars.length === 0 && <p className="hint">暂无已创建的角色，请先点击下方“＋ 创建角色”</p>}
              {myChars.length > 0 && shownChars.length === 0 && <p className="hint">没有搜索结果</p>}
            </div>
            {hiddenCount > 0 && <p className="hint" style={{ marginTop: 6 }}>还有 {hiddenCount} 个角色，请通过搜索查找</p>}
            <p className="hint">对方角色请在角色关系详情页通过[＋ 添加成员]添加</p>
            {onNewChar && (
              <button type="button" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
                data-tip="创建角色后将返回此页面；此处填写的内容不会保存"
                onClick={onNewChar}>＋ 创建角色</button>
            )}
          </div>
        )}

        {/* 아트 다중 등록 — 첫 장 = 대표 · 리스트 썸네일(4:3 크롭) */}
        <label className="k-label" style={{ margin: 0 }}>
          {auObj ? `插画 — ${auObj.label} AU` : '插画'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
            {auObj ? '— 选择此 AU 时显示的中央插画' : '— 第一张为主图，列表缩略图按 4:3 裁剪；详情页可切换查看插画'}</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="点击查看原图" onClick={() => setLb(i)}
                  style={{ width: 84, aspectRatio: '4/3', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">主图 · 缩略图</span>
                    {/* 옆의 「대표 · 썸네일」 뱃지와 세로 크기 통일 (23px) */}
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
        <input id="relArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('relArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ 添加插画 {arts.length === 0 && '（添加第一张时可设置缩略图裁剪）'}
        </button>

        {/* 전신 이미지 (v1.9) — 페어 좌/우 캐릭터, 미리보기에서 드래그=크기 · 클릭=앞으로 */}
        {pairMembers.length > 0 && (
          <>
            <label className="k-label" style={{ margin: 0 }}>
              {auObj ? `全身图 — ${auObj.label} AU` : '全身图'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
                — 用于中央全身图模式左右位置；在预览中拖动可调整大小，点击可置于前方</span>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {pairMembers.map(m => {
                const d = fulls[m.charId];
                const nm = memberNames?.[m.charId] ?? m.charId;
                return (
                  <div key={m.charId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b style={{ fontSize: 12 }}>{nm}</b>
                    <label className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, cursor: 'var(--cur-pointer,pointer)' }}
                      {...fileDrop(fl => { const f = fl[0]; if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } })); })}>
                      {d ? '更换' : '↑ 上传'}
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]; e.target.value = '';
                          if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } }));
                        }} />
                    </label>
                    {d && (
                      <span className="fx" onClick={() => del.ask(`确定删除 ${nm} 的全身图吗？`, () => setFulls(o => {
                        const n = { ...o }; delete n[m.charId]; return n;
                      }))}>✕</span>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(fulls).length > 0 && (
              /* 실제 표시와 같은 비율(3/4.1)·같은 배치(fb 좌우 박스) — 여기서 잡은 크기가 상세 그대로 (v1.9) */
              <div style={{
                position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '3/4.1', borderRadius: 10,
                overflow: 'hidden', background: 'linear-gradient(180deg,#262b33,#181b20)', border: '1px solid var(--line)',
              }}>
                {pairMembers.map((m, i) => (
                  <div key={m.charId} style={{
                    position: 'absolute', width: '62%', bottom: '-2%',
                    top: i === 0 ? '5%' : '12%',
                    ...(i === 0 ? { left: '-4%' } : { right: '-4%' }),
                    zIndex: (fullFront ?? pairMembers[1]?.charId) === m.charId ? 3 : 2,
                  }}>
                    <FullPrevImg draft={fulls[m.charId]}
                      scale={fullScales[m.charId] ?? 90}
                      offX={fullOffsets[m.charId]?.x ?? 0}
                      offY={fullOffsets[m.charId]?.y ?? 0}
                      name={memberNames?.[m.charId] ?? m.charId}
                      shadow={fullShadow(shadowCustom ? nameShadowColor : undefined,
                        shadowCustom ? nameShadow : undefined, '0 6px 14px')}
                      onScale={v => setFullScales(s => ({ ...s, [m.charId]: v }))}
                      onOffset={(x, y) => setFullOffsets(s => ({ ...s, [m.charId]: { x, y } }))}
                      onLayer={front => {
                        const other = pairMembers.find(x => x.charId !== m.charId)?.charId;
                        setFullFront(front ? m.charId : (other ?? m.charId));
                      }} />
                  </div>
                ))}
                {fullFront && (
                  <span className="pill" style={{ position: 'absolute', left: 10, top: 10, zIndex: 5 }}>
                    前方：{memberNames?.[fullFront] ?? fullFront}
                  </span>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '4px 0 0' }}>拖动 = 移动位置 · 滚轮 = 调整大小 · 右键 = 调整前后层级；预览比例与详情页相同</p>

            {/* 이 AU에서 부르는 이름 (커플홈 사용자 요청 — 「AU가 바뀌면 이름도 바뀔 수 있는데 바꿀 데가 없다」).
                자관 페이지의 멤버 카드·목록에 쓴다. 캐릭터 페이지의 AU 프로필과는 별개 */}
            {auObj && (
              <>
                <label className="k-label" style={{ margin: '10px 0 0' }}>姓名 — 在此 AU 中使用的名称</label>
                {pairMembers.map((m, i) => (
                  <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '左侧' : '右侧'} · {memberNames?.[m.charId] ?? m.charId}</b>
                    <KInput value={names[m.charId] ?? ''}
                      onChange={e => setNames(s => ({ ...s, [m.charId]: e.target.value }))}
                      placeholder="留空则使用角色原名" style={{ flex: 1 }} />
                  </div>
                ))}
              </>
            )}

            {/* 좌/우 한마디 문구 (v2.0 사용자 발견 — 색만 있고 문구 칸이 없었다) */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>角色台词 — 顶部左右文案{auObj ? '（仅此 AU）' : ''}</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '左侧' : '右侧'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KInput value={quotes[m.charId] ?? ''}
                  onChange={e => setQuotes(s => ({ ...s, [m.charId]: e.target.value }))}
                  placeholder="留空则不显示" style={{ flex: 1 }} />
              </div>
            ))}

            {/* 멤버 카드 이름 크기 (v2.0 사용자 확정) — 자동으로 줄이지 않고 직접 정한다 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>姓名大小 — 成员卡片</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '左侧' : '右侧'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KCheck label="Bold" checked={nameBolds[m.charId] ?? true}
                  onChange={(v: boolean) => setNameBolds(s => ({ ...s, [m.charId]: v }))} />
                <KStep value={nameSizes[m.charId] ?? 17}
                  onChange={(v: number) => setNameSizes(s => ({ ...s, [m.charId]: v }))}
                  min={10} max={32} step={1} suffix="px" />
              </div>
            ))}

            {/* 히어로 대사 색 (페어, v1.9 사용자 요청) — 좌/우 캐릭터 대사 글씨색·따옴표색 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>台词颜色 — 顶部左右文案</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 12, width: 92 }}>{i === 0 ? '左侧' : '右侧'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <span className="cp-lb">文字</span>
                <ColorField value={quoteColors[m.charId]?.fg ?? '#d7dae0'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], fg: hex } }))} />
                <span className="cp-lb">引号</span>
                <ColorField value={quoteColors[m.charId]?.mark ?? '#c96a73'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], mark: hex } }))} />
              </div>
            ))}
          </>
        )}

        {/* 헤더 이미지 (v1.5) — 상단 풀폭 블러 + 아래로 페이드아웃 · 위치 크롭(원본 무손실) */}
        <label className="k-label" style={{ margin: 0 }}>
          页眉图片 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 以模糊全宽背景显示在详情页顶部，并向下渐隐（选填）</span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 200, aspectRatio: '3/1', borderRadius: 8, overflow: 'hidden', position: 'relative', border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
            onClick={() => document.getElementById('relHeaderF')?.click()}
            {...fileDrop(fl => {
              const hf = fl[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);
              }
            })}>
            {headerUrl ? (
              <div style={{ position: 'absolute', inset: 0, filter: `blur(${Math.round(headerBlur / 8)}px)` }}>
                <CropImg src={headerUrl} crop={headerCrop} />
              </div>
            ) : (!headerRemoved && initHeaderId) ? (
              <HeaderPreview refId={initHeaderId} crop={headerCrop} />
            ) : (
              <div className="ph" style={{ width: '100%', height: '100%' }}><span style={{ fontSize: 10 }}>HEADER</span></div>
            )}
          </div>
          <input id="relHeaderF" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const hf = e.target.files?.[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);   // 업로드 즉시 위치 지정
              }
              e.target.value = '';
            }} />
          {(headerUrl || (!headerRemoved && initHeaderId)) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => setHeaderCropOpen(true)}>✂ 位置</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => { setHeaderFile(null); setHeaderUrl(''); setHeaderRemoved(true); setHeaderCrop(undefined); }}>移除</button>
            </>
          )}
        </div>
        {/* 흐림 (커플홈 사용자 요청 — "헤더 이미지를 흐리지 않게 하는 것과 흐림 정도 조절") — 끄면 원본 그대로 */}
        {(headerUrl || (!headerRemoved && initHeaderId)) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="cp-lb">模糊</span>
            <KCheck label="启用模糊" checked={headerBlur > 0} onChange={(v: boolean) => setHeaderBlur(v ? HEADER_BLUR_DEFAULT : 0)} />
            {headerBlur > 0 && <KStep value={headerBlur} min={2} max={40} step={2} suffix="px" onChange={setHeaderBlur} />}
            <small className="hint" style={{ margin: 0 }}>{headerBlur > 0 ? `数值越大，模糊越强（默认 ${HEADER_BLUR_DEFAULT}）` : '显示原图'}</small>
          </div>
        )}
        {headerCropOpen && (headerUrl || (!headerRemoved && initHeaderId)) && (
          <HeaderCrop src={headerUrl} refId={!headerUrl ? initHeaderId : undefined} crop={headerCrop}
            onClose={() => setHeaderCropOpen(false)}
            onApply={c => { setHeaderCrop(c); setHeaderCropOpen(false); }} />
        )}

        {/* 헤더 이미지가 없을 때 대신 깔 배경 (v2.0 사용자 요청) — 디자인 탭 배경 설정과 같은 방식.
            지정하지 않으면 예전처럼 그 자리엔 아무것도 안 그린다. AU마다 따로 정할 수 있다 */}
        {(
          <div style={{ marginTop: 10 }}>
            <KCheck label="无页眉图片时自定义背景" checked={headerBgCustom} onChange={setHeaderBgCustom} />
            {headerBgCustom && (
              <div className="cf-stack" style={{ marginTop: 8 }}>
                <div className="cf-row">
                  <ColorField value={headerBgG1} onChange={setHeaderBgG1} />
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                  <ColorField value={headerBgG2} onChange={setHeaderBgG2} />
                </div>
                <div className="cf-row">
                  <span className="cp-lb">角度</span>
                  <KStep value={headerBgAngle} min={0} max={360} step={15} suffix="°" onChange={setHeaderBgAngle} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 우: 기본 정보 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>基本信息</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="角色关系名称" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
            {/* AU별 자관명 (v2.0 사용자 요청) — 이 AU를 볼 때만 쓰는 이름. 비우면 위 이름 그대로 */}
            {auObj && (
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>{auObj.label} AU 名称</label>
                <KInput placeholder={name || '沿用角色关系名称'} value={auName}
                  onChange={e => setAuName(e.target.value)}
                  style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
                <p className="hint" style={{ margin: '5px 0 0' }}>
                  仅在查看此 AU 时使用的名称；留空则沿用角色关系名称
                </p>
                {/* AU 페이지 주소 (커플홈 사용자 요청 — 「AU 페이지도 AU 프로필도 고유 주소를」).
                    /rels/{자관}?au={주소}. 멤버의 AU 프로필 주소(?au=)에도 같은 별명을 쓴다 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>?au=</span>
                  <KInput placeholder={`AU 地址（留空则使用 ${auObj.id}）`} value={auSlug}
                    onChange={e => setAuSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                <p className="hint" style={{ margin: '5px 0 0' }}>
                  此 AU 页面的地址，仅可使用小写英文字母、数字和连字符。角色 AU 资料页地址（?au=）也会使用此地址
                </p>
              </div>
            )}
            {/* 페이지 주소 (v1.9) — /rels/{slug}, 비우면 자동 · 중복이면 경고 */}
            {/* 수정에서도 바꿀 수 있다 (v2.0 사용자 요청) — 비우면 원래 주소(id) 그대로.
                AU 편집에서는 주소가 base 소관이라 숨긴다 */}
            {!auObj && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/rels/</span>
                  <KInput placeholder={isNew ? '页面地址（选填）' : `页面地址（留空则使用 ${initial?.id}）`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>此地址已被使用</p>
                )}
              </div>
            )}
            <KInput placeholder="标语" value={catchphrase} onChange={e => setCatchphrase(e.target.value)} />
            {/* 자관명·캐치프레이즈 글씨색 (v1.9 사용자 요청) — 기본은 테마색. AU마다 따로 정할 수 있다 (v2.0) */}
            {(
              <div>
                <KCheck label="自定义关系名称和标语颜色" checked={txtCustom} onChange={setTxtCustom} />
                {txtCustom && (
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">关系名称</span>
                    <ColorField value={nameColor} onChange={setNameColor} />
                    <span className="cp-lb">标语</span>
                    <ColorField value={cpColor} onChange={setCpColor} />
                  </div>
                )}
              </div>
            )}
            {/* 그림자 (v2.0 사용자 요청) — 어떤 색으로 얼마나 진하게 깔릴지. 자관명과 전신에 함께 걸린다 */}
            {(
              <div>
                <KCheck label="自定义阴影（关系名称和全身图）" checked={shadowCustom} onChange={setShadowCustom} />
                {shadowCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">颜色</span>
                      <ColorField value={nameShadowColor} onChange={setNameShadowColor} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">强度</span>
                      <KStep value={nameShadow} min={0} max={200} step={10} suffix="%" onChange={setNameShadow} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* CP/NCP (v1.9) — CP=커플 · NCP=커플 아님. AU마다 따로 지정은 상세의 AU 관리에서 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label className="k-label" style={{ margin: 0 }}>类型</label>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={cp === t ? 'on' : ''} onClick={() => setCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
            </div>
            {/* 뱃지 문구 (커플홈 사용자 요청) — 자관명 위 뱃지에 CP/NCP 대신 쓸 글. 비우면 CP/NCP */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cp-lb">徽标文字</span>
              <KInput placeholder={`留空则使用“${CP_LABEL[cp]}”`} value={cpText} maxLength={24}
                onChange={e => setCpText(e.target.value)} style={{ flex: 1 }} />
            </div>
            {/* 뱃지 색 (v2.0 사용자 요청) — 자관명 위에 뜨는 CP/NCP 표시. AU마다 따로 */}
            {(
              <div>
                <KCheck label="自定义 CP 徽标颜色" checked={tagCustom} onChange={setTagCustom} />
                {tagCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">背景</span>
                      <ColorField value={cpTagBg} onChange={setCpTagBg} />
                      <span className="cp-lb">文字</span>
                      <ColorField value={cpTagFg} onChange={setCpTagFg} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">预览</span>
                      <span className="pill" style={{ background: cpTagBg, color: cpTagFg, borderColor: cpTagBg }}>
                        {cpText.trim() || CP_LABEL[cp]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '2px 0 0' }}>名称字体 — 应用于详情页大标题</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            {/* 자관명 크기·굵게 (커플홈 사용자 요청) — 캐릭터 이름과 같은 방식. 폰트마다 알맞은 크기가 달라 직접 정한다 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="k-label" style={{ margin: 0, flex: 1 }}>关系名称大小</span>
              <KCheck label="Bold" checked={titleBold} onChange={setTitleBold} />
              <KStep value={titleSize} onChange={setTitleSize} min={24} max={120} step={1} suffix="px" />
            </div>
            <p className="hint" style={{ margin: '2px 0 0' }}>正文字体 — 应用于卡片介绍、时间线和问答</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <div>
              <label className="k-label">页面主题{auObj ? ` — ${auObj.label}` : ''}</label>
              {/* AU 편집 (v1.9) — 기존(원본) 테마 따라가기 / 이 AU 전용 테마 */}
              {auObj && (
                <div className="mini-seg" style={{ marginBottom: 6 }}>
                  <button className={themeFollow ? 'on' : ''} onClick={() => setThemeFollow(true)}>沿用原设主题</button>
                  <button className={!themeFollow ? 'on' : ''} onClick={() => setThemeFollow(false)}>仅用于此 AU</button>
                </div>
              )}
              {!(auObj && themeFollow) && (
              <div className="mini-seg">
                <button className={themeMode === 'site' ? 'on' : ''} onClick={() => setThemeMode('site')}>沿用主页主题</button>
                <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>自定义主题色</button>
              </div>
              )}
              {!(auObj && themeFollow) && themeMode === 'custom' && (
                /* 공용 ColorField — 다른 색 입력들과 동일 스타일 (v1.9 사용자 피드백) */
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <ColorField value={themeColor} onChange={setThemeColor} />
                  <div className="mini-seg">
                    <button className={themeTone === 'dark' ? 'on' : ''} onClick={() => setThemeTone('dark')}>深色基调</button>
                    <button className={themeTone === 'light' ? 'on' : ''} onClick={() => setThemeTone('light')}>浅色基调</button>
                  </div>
                </div>
              )}
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {auObj && themeFollow
                  ? '此 AU 沿用原设角色关系的页面主题'
                  : themeMode === 'custom'
                  ? '进入此页面时，主页整体配色会切换为此颜色；离开后恢复原主题'
                  : '此页面沿用主页主题'}
              </p>
            </div>
            {/* 문답 답변 가리기 (v2.0 사용자 요청) — 방문자에게 답변 내용을 안 보이게.
                자관 전체 설정이라 AU 편집에서는 두지 않는다 */}
            {!auObj && (
              <div>
                <KCheck label="隐藏问答内容" checked={qaHide} onChange={setQaHide} />
                <p className="hint" style={{ margin: '5px 0 0', lineHeight: 1.6 }}>
                  问题保持可见，只隐藏<b>回答内容</b> — 仅管理员和获得此角色关系中角色权限的成员可查看。
                  {qaHide && (
                    <>
                      <br />
                      <b style={{ color: 'var(--accent)' }}>此设置仅在界面中隐藏内容，并非完全屏蔽。</b>{' '}
                      回答仍以公开形式保存，有心查找的人仍可能看到；请勿填写绝不能公开的内容。
                    </>
                  )}
                </p>
              </div>
            )}

            {/* 페이지 배경 (v2.0 사용자 요청) — 이 페이지에 있는 동안의 바탕 그라데이션. AU마다 따로 */}
            {(
              <div>
                <KCheck label="自定义页面背景" checked={pageBgCustom} onChange={setPageBgCustom} />
                {pageBgCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <ColorField value={pageBgG1} onChange={setPageBgG1} />
                      <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                      <ColorField value={pageBgG2} onChange={setPageBgG2} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">角度</span>
                      <KStep value={pageBgAngle} min={0} max={360} step={15} suffix="°" onChange={setPageBgAngle} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 전신/일러 스위치 색 (v1.9 사용자 요청) — 페어 중앙 이미지의 전환 스위치. AU마다 따로 (v2.0) */}
            {(
              <div>
                <KCheck label="自定义全身图/插画切换按钮颜色" checked={illuCustom} onChange={setIlluCustom} />
                {illuCustom && (
                  /* 한 줄 고정 (v1.9 사용자 피드백) — 좁은 패널에서 두 줄로 내려가지 않게 인풋이 줄어듦 */
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">背景</span>
                    <ColorField value={illuBg} onChange={setIlluBg} />
                    <span className="cp-lb">选中</span>
                    <ColorField value={illuOn} onChange={setIlluOn} />
                  </div>
                )}
              </div>
            )}
            <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
              options={[
                { value: 'public', label: '公开' },
                { value: 'member', label: '成员可见' },
                { value: 'private', label: '仅自己可见' },
              ]} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>取消</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? '创建' : '保存'}
          </button>
        </div>
      </div>

      {arts[0] && cropOpen && (
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

/** 저장된 헤더 이미지 미리보기 — 위치 크롭 반영 */
function HeaderPreview({ refId, crop }: { refId: string; crop?: CropValue }) {
  const url = useBlobUrl(refId);
  if (!url) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)' }}>
      <CropImg src={url} crop={crop} />
    </div>
  );
}

/** 헤더 위치 크롭 — 새 파일(objectURL) 또는 저장 블롭 소스, 프레임 비율 = 상세 헤더(약 3:1) */
function HeaderCrop({ src, refId, crop, onClose, onApply }: {
  src: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const s = src || loaded;
  if (!s) return null;
  return <CropEditor open src={s} aspect={3} aspectLabel="页眉比例" initial={crop} onClose={onClose} onApply={onApply} />;
}

/** 첫 아트(새 파일 또는 저장된 blob)를 소스로 4:3 크롭 편집기 */
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
  if (!src) return null;
  return <CropEditor open={open} src={src} aspect="4:3" initial={crop} onClose={onClose} onApply={onApply} />;
}
