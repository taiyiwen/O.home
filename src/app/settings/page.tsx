'use client';
// 환경설정 (기획서 5장) — 0차: 「디자인」 탭(테마) 실동작.
// 나머지 카테고리는 해당 기능 마일스톤에서 함께 구현.
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, inviteCode, setInviteCode } from '@/lib/auth';
import { useMembers } from '@/lib/members';
import { currentHomeId } from '@/lib/home';
import { useTheme } from '@/lib/ThemeProvider';
import { ThemeVars } from '@/lib/theme';
import { ColorField } from '@/components/ui/ColorField';
import { KStep, KToggle, KInput, LiveInput, KTextarea, KSelect, KCheck, Pager } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useMainStore, WidgetConf, WIDGET_META, MULTI_TYPES, widgetLabel } from '@/lib/mainStore';
import { useConfirmDelete, ConfirmModal, Modal } from '@/components/ui/Modal';
import { exportBackup, importBackup, resetGroups, RESET_CONTENT, RESET_EXTRA } from '@/lib/backup';
import { DiaryPost, DIARY_SEED } from '@/lib/diaryStore';
import { newId, todayYmd } from '@/lib/postStore';
import { useCommSettings, badgeStyle, CommBadge, CommSettings } from '@/lib/commStore';
import {
  useBoardSettings, boardBadgeStyle, BoardBadge, galleryCatsOf, videoCatsOf,
  useBoards, Board, BoardSkin, BoardPerm, DEFAULT_BOARD_CATS, MAIN_BOARD_ID, boardHref,
} from '@/lib/boardStore';
import { useThreadSettings, ThreadWork, THREAD_SEED, ThreadCat, threadBadgeStyle, threadCats, threadCatsPatch } from '@/lib/threadStore';
import { useTrpgSettings, DOTORI_STATUS_KEYS, DotoriStatus, dotoriBadgeStyle } from '@/lib/galleryStore';
import { useMemoSettings } from '@/lib/memoStore';
import {
  useMenuSettings, MenuSettings, MenuPerm, MenuVis, PLAYLOG_COLS,
  MenuGroupNode, MenuLeaf, defaultTree, newGroupId, menuLabelFor, extraBoardHref, boardEntries,
  IMG_PROTECT_AREAS, writeKeyOf,
} from '@/lib/menuStore';
import { FEATURES } from '@/lib/menu';
import { SectionsBlock } from '@/components/settings/SectionList';
import { useSections, sectionsOf, sectionMenuEntries, MAIN_SEC, inSection, SECTION_META, SectionKind } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries, toInternalPath } from '@/lib/linkStore';
import { useSiteDraft } from '@/lib/siteStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCursorSettings, CursorState, CURSOR_STATE_LABEL } from '@/lib/cursorStore';
import { RelQuestionSet, RELQ_SEED, RELQ_KEY, CP_LABEL } from '@/lib/relqStore';
import { SymbolInput } from '@/components/ui/SymbolInput';
import { allBlobs, putBlobAs, useBlobUrl, getBlob } from '@/lib/blobStore';
import { parseAni } from '@/lib/aniCursor';
import { fileDrop } from '@/lib/dnd';
import { Character, CHAR_SEED, Relation, REL_SEED, charPath, relsWithoutChar, relMenuEntries } from '@/lib/charStore';
import { phStyle } from '@/lib/color';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { useLocalList } from '@/lib/postStore';
import { Mood, MOOD_SEED, moodTint, useDiarySettings, DiaryCat } from '@/lib/diaryStore';
import {
  TextSettingEditor, DdayEditor, TodoEditor, BannerEditor, DecoEditor,
} from '@/components/main/widgetEditors';
import { useBgm, BgmTrack, parseVideoId, MAIN_LIST } from '@/lib/bgmStore';
import { useFonts, fontCssUrl, FontDef, FontRole, ROLE_LABEL, FOLLOW_MENU, FOLLOW_TITLE } from '@/lib/fontStore';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc, getPageText, setPageText } from '@/components/ui/PageText';
import { putBlob } from '@/lib/blobStore';
import { getSetting, setSetting, pushLocalSettings, unsyncedSettingKeys, SETTING_KEYS } from '@/lib/settingStore';
import { isServerMode, createBackend, backend } from '@/lib/backend';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { CONTENT_COLLECTIONS } from '@/lib/backend/types';
import { visFloorOf } from '@/lib/visFloor';
import { validateConfig, configFileText, saveLocalConfig, parseFirebaseSnippet, serverConfig, serverConfigSource } from '@/lib/serverConfig';
import { migrateTo, findOrphanFiles } from '@/lib/transfer';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';
import { SCHEMA_SQL } from '@/lib/schemaSql';

const CATEGORIES = [
  '디자인', '메인 페이지', '위젯', '메뉴 관리', '게시판 관리', '캐릭터', '자관 질문', 'TRPG', '감상타래', '메모장',
  '폰트', '마우스 커서', 'BGM', '다이어리', '회원/보안', '데이터 백업',
] as const;

/** 색 항목 한 쌍 렌더 헬퍼 */
function CP({ label, k, def }: { label?: string; k: keyof ThemeVars; def?: string }) {
  const { state, setVar } = useTheme();
  // def: 값이 없을 때 실제로 적용되는 기본색 (예: 입력 포커스 = 포인트색)
  return (
    <>
      {label && <span className="cp-lb">{label}</span>}
      <ColorField value={String(state.vars[k] ?? def ?? '#888888')} onChange={hex => setVar(k, hex as never)} />
    </>
  );
}

/**
 * 위젯 스타일 (v2.0 사용자 요청) — 메인·사이드에 얹히는 카드의 배경·타이틀색·본문색·테두리.
 *
 * 색을 안 정하면 `--wg-*`가 카드 색을 그대로 가리키므로 지금까지와 똑같이 보인다. 그래서 값이
 * 비어 있을 때 입력란에는 **지금 실제로 쓰이는 카드 색**을 채워 둔다 — 처음 열었을 때 엉뚱한
 * 회색이 아니라 화면에 보이는 그 색이 나와야 조금만 바꿔 쓰기 쉽다.
 * 테두리는 켤 때만 그린다(끄면 지금처럼 그림자만).
 */
function WidgetStyleRow() {
  const { state, setVar } = useTheme();
  const v = state.vars;
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>组件</b>
        <small>主页和侧栏中的卡片；留空时沿用卡片颜色</small></div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
        <div className="cp-grid2">
          <CP label="背景" k="wgBg" def={v.cardBg ?? '#fbfbfc'} />
          <CP label="标题" k="wgTitle" def={v.pageDesc ?? '#8a8f98'} />
          <CP label="正文" k="wgFg" def={v.cardFg ?? '#1d2025'} />
        </div>
        <div className="cf-row" style={{ justifyContent: 'flex-end' }}>
          <KCheck label="边框" checked={!!v.wgBorder} onChange={b => setVar('wgBorder', b)} />
          {v.wgBorder && <CP label="颜色" k="wgBd" def="#e6e8ec" />}
        </div>
      </div>
    </div>
  );
}

/** 역할 폰트 한 줄 — 폰트 + 굵기 + 크기 배율 (5.1, 폰트별 체감 크기 보정) */
function FontRoleRow({ role }: { role: FontRole }) {
  const { fonts, roles, setRole, familyOf } = useFonts();
  const cfg = roles[role];
  const wBtn = (w: number | undefined, label: string) => (
    <button className={cfg.weight === w ? 'on' : ''} onClick={() => setRole(role, { weight: w })}>{label}</button>
  );
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>{ROLE_LABEL[role].label}</b>{ROLE_LABEL[role].desc && <small>{ROLE_LABEL[role].desc}</small>}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* 폰트 이름이 길어도 줄이 넘어가지 않게 상한을 둔다 — 넘치면 … (v2.0 사용자 요청) */}
        <KSelect minWidth={170} value={cfg.id} onChange={v => setRole(role, { id: v })}
          options={[
            ...(role === 'dropdown' ? [{ value: FOLLOW_MENU, label: <span>与菜单字体相同</span> }] : []),
            ...(role === 'pagetitle' ? [{ value: FOLLOW_TITLE, label: <span>与标题字体相同</span> }] : []),
            ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> })),
          ]} />
        <div className="mini-seg">
          {wBtn(undefined, '기본')}
          {wBtn(300, '가늘게')}
          {wBtn(400, '보통')}
          {wBtn(700, '굵게')}
        </div>
        <KStep value={cfg.scale ?? 100} min={80} max={130} step={5} suffix="%"
          onChange={v => setRole(role, { scale: v })} />
      </div>
    </div>
  );
}

function DesignPane() {
  const {
    state, dirty: themeDirty, setMode, setPointAccent, setPointTone, setVar,
    resetMode, save, discard, presets, savePreset, applyPreset, removePreset,
  } = useTheme();
  // 디자인 탭의 색상 외 요소(로고·역할 폰트)도 SAVE 드래프트로 통합 (v1.9 사용자 확정)
  const siteDraft = useSiteDraft();
  const { rolesDirty, saveRoles, discardRoles } = useFonts();
  const dirty = themeDirty || siteDraft.dirty || rolesDirty;
  // 저장 안 한 채 새로고침·창 닫기를 하면 조용히 사라진다 —
  // 미리보기가 화면(탭 제목·로고·색)에 바로 적용돼서 저장된 줄 알기 쉬우므로 한 번 물어본다
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const toast = useToast();
  const del = useConfirmDelete();
  const [resetOpen, setResetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetSel, setPresetSel] = useState('');
  const modeBtn = (m: typeof state.mode, label: string) => (
    <button className={state.mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
  );
  return (
    <div className="set-sec">
      <h3>主题</h3>
      <div className="d">更改会立即预览，点击“保存”后才会保存；每种模式的设置分别记忆</div>

      <div className="set-row">
        <div className="l"><b>模式</b><small>切换模式时会保留各模式的设置；可在“选择重置”中分别重置</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg in-panel">
            {modeBtn('light', '浅色')}
            {modeBtn('dark', '深色')}
            {modeBtn('point', '自动强调色')}
            {modeBtn('custom', '自定义')}
          </div>
          <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 11 }}
            onClick={() => setResetOpen(true)}>选择重置</button>
        </div>
      </div>

      {/* 저장/취소 — 이리저리 실험 후 저장하지 않을 수 있음 (v1.9) */}
      <div className="set-row">
        <div className="l"><b>保存</b><small>更改会立即显示，但<b>点击“保存”后才会真正保存</b> — 包括颜色、字体、徽标和标签标题</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>有未保存的更改</span>}
          {/* 컨트롤 세로 크기 통일 — 35px (btn-dark 기본과 동일) */}
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11, opacity: dirty ? 1 : 0.45 }}
            disabled={!dirty} onClick={() => { discard(); siteDraft.discard(); discardRoles(); toast('已恢复已保存的主题'); }}>取消更改</button>
          <button className="btn btn-dark" style={{ padding: '0 18px', fontSize: 11, opacity: dirty ? 1 : 0.45 }}
            disabled={!dirty} onClick={() => { save(); siteDraft.save(); saveRoles(); toast('主题已保存'); }}>保存</button>
        </div>
      </div>

      {/* 테마 프리셋 — 이름으로 저장해 두고 드롭다운에서 커스텀으로 적용 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>保存主题方案</b><small>按名称保存当前配色；应用时会载入自定义模式</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 저장된 테마 컨트롤은 왼쪽에 등장 — 테마 이름/KEEP 위치는 고정 (사용자 확정) */}
          {presets.length > 0 && (
            <>
              <KSelect minWidth={140} value={presetSel} onChange={setPresetSel}
                options={[{ value: '', label: '已保存的主题' }, ...presets.map(p => ({ value: p.id, label: p.name }))]} />
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => { if (presetSel) { applyPreset(presetSel); toast('已应用到自定义模式，请保存以确认'); } }}>应用</button>
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11, marginRight: 10 }}
                onClick={() => {
                  const p = presets.find(x => x.id === presetSel);
                  if (p) del.ask(`테마 「${p.name}」를 삭제하시겠습니까?`, () => { removePreset(p.id); setPresetSel(''); });
                }}>删除</button>
            </>
          )}
          {/* 인풋·버튼 세로 크기 통일 (35px) */}
          <KInput placeholder="主题名称" value={presetName} onChange={e => setPresetName(e.target.value)}
            style={{ width: 120, height: 35, boxSizing: 'border-box' }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => {
              if (!presetName.trim()) { toast('请输入主题名称'); return; }
              savePreset(presetName.trim());
              setPresetName('');
              toast('主题方案已保存');
            }}>保存方案</button>
        </div>
      </div>

      {/* 선택 리셋 — 모드를 골라 그 모드의 수정값만 초기화 */}
      <ConfirmModal open={resetOpen} wide title="要重置哪种主题模式？"
        body="仅所选模式会恢复初始设置。点击“保存”后才会确认。"
        onClose={() => setResetOpen(false)}
        buttons={[
          { label: '浅色', kind: 'ghost', onClick: () => { resetMode('light'); setResetOpen(false); } },
          { label: '深色', kind: 'ghost', onClick: () => { resetMode('dark'); setResetOpen(false); } },
          { label: '自动强调色', kind: 'ghost', onClick: () => { resetMode('point'); setResetOpen(false); } },
          { label: '自定义', kind: 'ghost', onClick: () => { resetMode('custom'); setResetOpen(false); } },
          { label: '取消', kind: 'dark', onClick: () => setResetOpen(false) },
        ]} />
      {del.element}

      <div className="set-row">
        <div className="l"><b>自动强调色明暗</b><small>设置自动强调色模式使用深色或浅色基调</small></div>
        <div className="mini-seg">
          <button className={state.pointTone === 'dark' ? 'on' : ''} onClick={() => setPointTone('dark')}>深色基调</button>
          <button className={state.pointTone === 'light' ? 'on' : ''} onClick={() => setPointTone('light')}>浅色基调</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>强调色</b><small>自动强调色模式的基准颜色，更改后会立即更新全站配色</small></div>
        <div className="cp-group">
          <ColorField value={state.vars.accent}
            onChange={hex => state.mode === 'point' ? setPointAccent(hex) : setVar('accent', hex)} />
        </div>
      </div>

      {/* 배경 — 그라데이션(각도) / 이미지(블러) 선택 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>背景</b><small>渐变（起始色→结束色和角度）或图片（上传和模糊）</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="mini-seg">
            <button className={(state.vars.bgType ?? 'gradient') === 'gradient' ? 'on' : ''}
              onClick={() => setVar('bgType', 'gradient')}>渐变</button>
            <button className={state.vars.bgType === 'image' ? 'on' : ''}
              onClick={() => setVar('bgType', 'image')}>图片</button>
          </div>
          {(state.vars.bgType ?? 'gradient') === 'gradient' ? (
            <>
              <CP k="bgG1" />
              <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
              <CP k="bgG2" />
              <span className="cp-lb">角度</span>
              <KStep value={state.vars.bgAngle ?? 180} min={0} max={360} step={15} suffix="°"
                onChange={v => setVar('bgAngle', v)} />
            </>
          ) : (
            <>
              <input id="themeBgFile" type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) setVar('bgImageId', await putBlob(f));
                  e.target.value = '';
                }} />
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => document.getElementById('themeBgFile')?.click()}>
                {state.vars.bgImageId ? '更换' : '上传'}
              </button>
              {state.vars.bgImageId && (
                <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                  onClick={() => setVar('bgImageId', undefined)}>移除</button>
              )}
              <span className="cp-lb">模糊</span>
              <KStep value={state.vars.bgBlur ?? 0} min={0} max={30} step={2} suffix="px"
                onChange={v => setVar('bgBlur', v)} />
            </>
          )}
        </div>
      </div>

      {/* 카드 색 — 패널·게시판 리스트·필터 등 공통 (v1.9) */}
      <div className="set-row">
        <div className="l"><b>卡片</b><small>面板、帖子列表和筛选卡片的背景及文字颜色；辅助文字颜色会自动生成</small></div>
        <div className="cp-group">
          <CP label="배경" k="cardBg" />
          <CP label="글씨" k="cardFg" />
        </div>
      </div>

      {/* 브라우저 탭 제목 (v1.9 사용자 요청) — 비우면 「로고 텍스트 — 개인홈」 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>浏览器标签标题</b><small>显示在标签页和书签中的名称；留空时使用“徽标文字 — 个人主页”</small></div>
        <DocTitleControl />
      </div>

      {/* 브라우저 탭 아이콘 (v2.0 사용자 요청) — 지정 전에는 배포 기본 아이콘이 뜬다 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>浏览器标签图标</b><small>显示在标签页和书签中的小图标；建议使用正方形 PNG，留空则使用默认图标</small></div>
        <FaviconControl />
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>链接分享说明</b><small>在 KakaoTalk、Discord 等平台分享链接时显示在标题下方的一行文字；留空时使用副标题或默认文字</small></div>
        <CrawlDescControl />
      </div>

      {/* 로고 — 텍스트/서브타이틀/정렬/글씨색 (5.2) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>徽标</b><small>设置顶部栏徽标文字、副标题和对齐方式</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
          <LogoControls />
          {/* 글씨색은 줄 오른쪽 끝으로 (v1.9 사용자 요청) */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CP label="글씨" k="topBrand" />
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>顶部菜单</b></div>
        <div className="cp-group">
          <CP label="배경" k="topBg" />
          <CP label="글씨" k="topFg" />
          <CP label="悬停文字" k="topHv" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>子菜单下拉项</b></div>
        <div className="cp-group">
          <CP label="배경" k="ddBg" />
          <CP label="글씨" k="ddFg" />
          <CP label="悬停" k="ddHv" />
        </div>
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>页面标题</b><small>各菜单顶部的大标题和说明文字</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 헤더 표시 옵션 (v1.9): 둘 다 / 제목만 / 설명만 / 안 띄움 */}
          <div className="mini-seg">
            {(['both', 'title', 'desc', 'none'] as const).map(m => (
              <button key={m} className={(state.vars.pageHead ?? 'both') === m ? 'on' : ''}
                onClick={() => setVar('pageHead', m)}>
                {m === 'both' ? '全部显示' : m === 'title' ? '仅标题' : m === 'desc' ? '仅说明' : '全部隐藏'}
              </button>
            ))}
          </div>
          {/* 모바일에서만 헤더를 생략할지 (v1.9 사용자 요청) */}
          <span className="cp-lb">移动端</span>
          <div className="mini-seg">
            <button className={(state.vars.pageHeadM ?? 'same') === 'same' ? 'on' : ''}
              onClick={() => setVar('pageHeadM', 'same')}>相同</button>
            <button className={state.vars.pageHeadM === 'none' ? 'on' : ''}
              onClick={() => setVar('pageHeadM', 'none')}>隐藏</button>
          </div>
          <CP label="제목" k="pageTitle" />
          <CP label="설명" k="pageDesc" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>BGM 플레이어</b></div>
        <div className="cp-group">
          <CP label="배경" k="bgmBg" />
          <CP label="글씨" k="bgmFg" />
          <CP label="아이콘" k="bgmIc" />
          <CP label="볼륨바" k="bgmVol" />
        </div>
      </div>

      {/* 캐릭터 탭 리스트 (v1.9 사용자 요청) — 좌측 아이콘 탭 4색 */}
      <div className="set-row">
        <div className="l"><b>角色标签列表</b><small>角色详情页左侧的图标标签</small></div>
        <div className="cp-grid2">
          <CP label="배경" k="tabBg" />
          <CP label="글씨" k="tabFg" />
          <CP label="选中背景" k="tabOnBg" />
          <CP label="选中文字" k="tabOnFg" />
        </div>
      </div>

      {/* 입력 포커스 (v1.9 사용자 요청) — 인풋·텍스트에리어·드롭다운·에디터 공통 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>输入焦点</b><small>选中输入框或下拉菜单时显示的边框颜色和强调环</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
          {/* 미리보기는 왼쪽, 설정 컨트롤은 오른쪽 정렬 (v1.9 사용자 요청) */}
          <KInput style={{ width: 130, marginRight: 'auto' }} defaultValue="焦点预览" />
          <CP label="색" k="focusColor" def={state.vars.accent} />
          {/* 한 줄에 들어가도록 짧게 — 자세한 뜻은 툴팁 (v1.9) */}
          <div className="mini-seg">
            <button data-tip="柔和的光晕效果" className={(state.vars.focusRing ?? 'glow') === 'glow' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'glow')}>光晕</button>
            <button data-tip="清晰的实线边框" className={state.vars.focusRing === 'line' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'line')}>实线</button>
            <button data-tip="仅改变边框颜色，不显示强调环" className={state.vars.focusRing === 'none' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'none')}>仅边框</button>
          </div>
          {(state.vars.focusRing ?? 'glow') !== 'none' && (
            <>
              <span className="cp-lb">粗细</span>
              <KStep value={state.vars.focusW ?? 3} min={1} max={6} step={1} suffix="px"
                onChange={v => setVar('focusW', v)} />
            </>
          )}
        </div>
      </div>

      {/* 이미지 편집(크롭) 배경 (v1.9 사용자 요청) — 투명 PNG 위치 지정 시 보이는 판 */}
      <div className="set-row">
        <div className="l"><b>图片编辑背景</b><small>设置缩略图或页眉位置时显示的背景板，便于查看透明图片</small></div>
        <div className="cp-group">
          <CP label="배경" k="cropBg" />
        </div>
      </div>

      {/* 스티커 메모 보드 (v1.9 사용자 요청) — 라이트 모드에서 배치 판이 안 보이던 문제 */}
      <div className="set-row">
        <div className="l"><b>便笺板背景</b><small>用于便笺页布局画板和主页迷你便笺组件</small></div>
        <div className="cp-group">
          <CP label="배경" k="memoBoard" />
          <CP label="테두리" k="memoBoardBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>滚动条</b></div>
        <div className="cp-group">
          <CP label="색" k="sbThumb" />
          <CP label="테두리" k="sbBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>搜索框</b><small>帖子和列表共用的搜索输入框；会随浅色/深色模式自动切换</small></div>
        {/* 4항목은 한 줄에 안 들어가 밀림 — 2×2 그리드 정렬 (열 맞춤) */}
        <div className="cp-grid2">
          <CP label="배경" k="searchBg" />
          <CP label="글씨" k="searchFg" />
          <CP label="아이콘" k="searchIc" />
          <CP label="테두리" k="searchBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>切换标签</b><small>帖子分类、图集视图切换等；选中项沿用下方深色按钮的颜色</small></div>
        <div className="cp-group">
          <CP label="배경" k="segBg" />
          <CP label="글씨" k="segFg" />
        </div>
      </div>

      {/* 위젯 스타일 (v2.0 사용자 요청) — 메인·사이드 카드. 안 정하면 카드 색을 그대로 따라간다 */}
      <WidgetStyleRow />

      <div className="set-row">
        <div className="l"><b>深色按钮</b><small>用于发布、保存按钮以及复选框和选中筛选项</small></div>
        <div className="cp-group">
          <CP label="버튼" k="btnDark" />
          <CP label="글씨" k="btnDarkFg" />
          <CP label="호버" k="btnDarkHv" />
        </div>
      </div>

      {/* 사이트 역할 폰트 (5.1) — 폰트 라이브러리(내장+직접 등록)에서 선택 + 굵기·크기 보정 */}
      <FontRoleRow role="title" />
      <FontRoleRow role="pagetitle" />
      <FontRoleRow role="subtitle" />
      <FontRoleRow role="logosub" />
      <FontRoleRow role="menu" />
      <FontRoleRow role="dropdown" />
      <FontRoleRow role="body" />

      <div className="set-row">
        <div className="l"><b>圆角</b><small>卡片和按钮的圆角半径</small></div>
        <KStep value={state.vars.radius} min={0} max={30} onChange={v => setVar('radius', v)} />
      </div>

      {/* 그림자 설정 — 블록/드롭다운 나란히 묶음 */}
      <div className="set-row">
        <div className="l"><b>区块阴影</b><small>面板、卡片、横幅和弹窗的阴影强度；0% 表示无阴影</small></div>
        {/* 색은 왼쪽으로 빼고 세기 컨트롤은 오른쪽 — 아래 「드롭다운 그림자」 행과 열이 맞음 (v1.9 사용자 요청) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
          <span className="cp-lb" style={{ marginLeft: 'auto' }}>색</span>
          <ColorField value={state.vars.shColor ?? '#000000'} onChange={hex => setVar('shColor', hex)} />
          <div className="mini-seg" style={{ marginLeft: 10 }}>
            {([['无', 0], ['弱', 30], ['中', 50], ['强', 100]] as const).map(([label, v]) => (
              <button key={label} className={state.vars.shadow === v ? 'on' : ''}
                onClick={() => setVar('shadow', v)}>{label}</button>
            ))}
          </div>
          <KStep value={state.vars.shadow} min={0} max={200} step={10} suffix="%" onChange={v => setVar('shadow', v)} />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>下拉菜单阴影</b><small>用于子菜单、个人资料菜单、选择器和日历；独立于区块阴影，也可关闭</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="mini-seg">
            {([['无', 0], ['弱', 30], ['中', 50], ['强', 100]] as const).map(([label, v]) => (
              <button key={label} className={(state.vars.ddShadow ?? 100) === v ? 'on' : ''}
                onClick={() => setVar('ddShadow', v)}>{label}</button>
            ))}
          </div>
          <KStep value={state.vars.ddShadow ?? 100} min={0} max={200} step={10} suffix="%" onChange={v => setVar('ddShadow', v)} />
        </div>
      </div>

      <SpellCheckRow />
    </div>
  );
}

/** 맞춤법 검사 밑줄 (v2.0 사용자 요청) — 페이지 전체의 빨간 물결줄을 끈다.
 *  다른 로고·탭제목 설정과 같은 드래프트/SAVE 흐름을 탄다. */
function SpellCheckRow() {
  const { site, set } = useSiteDraft();
  const off = !!site.noSpell;
  return (
    <div className="set-row">
      <div className="l"><b>拼写检查下划线</b><small>浏览器在输入框和编辑器中显示的红色波浪线；关闭后将在整个站点隐藏</small></div>
      <div className="mini-seg">
        <button className={!off ? 'on' : ''} onClick={() => set({ noSpell: false })}>显示</button>
        <button className={off ? 'on' : ''} onClick={() => set({ noSpell: true })}>隐藏</button>
      </div>
    </div>
  );
}

/** 메인 페이지 탭 (v1.9 확정) — 모바일 표시 토글 + 모바일 세로 나열 순서
    토글은 모바일에서만 뺀다(사용자 확정) — PC 메인 구성은 편집모드의 [＋ 위젯]·우클릭 삭제로 */
function MainPagePane() {
  const { state, setMobileOff, setMobileOrder, resetMain } = useMainStore();
  const toast = useToast();
  const [resetAsk, setResetAsk] = useState(false);   // 기본 구성 확인 (v1.9)
  // 모바일 순서 목록: 고정 요소(배너·회원정보창)는 포함되지 않음
  const orderable = state.mobileOrder
    .map(id => state.widgets.find(w => w.id === id))
    .filter((w): w is NonNullable<typeof w> => !!w && !w.fixed);

  return (
    <div className="set-sec">
      {/* 제목 + 설명은 다른 탭과 똑같은 흐름(h3 → .d)으로 두고, 기본 구성 버튼만 우상단에 띄움
          (버튼 높이가 제목줄을 늘려 설명문이 떨어져 보이던 문제 — v1.9 사용자 피드백) */}
      <div style={{ position: 'relative' }}>
        <h3>主页</h3>
        <button className="btn btn-ghost" style={{ position: 'absolute', right: 0, top: -3, padding: '6px 14px', fontSize: 11 }}
          onClick={() => setResetAsk(true)}>恢复默认布局</button>
      </div>
      <ConfirmModal open={resetAsk} title="要将主页恢复为默认布局吗？"
        body="已添加的组件、位置、大小和移动端顺序都会恢复初始状态。此操作无法撤销。"
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: '恢复默认', kind: 'accent', onClick: () => { resetMain(); setResetAsk(false); toast('主页已恢复默认布局'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
      <div className="d">设置移动端显示状态和垂直排列顺序；拖动 ⠿ 可调整顺序</div>

      {/* 메인 레이아웃은 고정 캔버스 하나 — 반응형 옵션 제거 (v1.9, PC/모바일 두 가지만) */}
      <DragList
        items={orderable}
        keyOf={w => w.id}
        onReorder={list => setMobileOrder(list.map(w => w.id))}
        render={(w, i) => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="mw-no">{i + 1}</span>
              <span className="drag-h">⠿</span>
              <div>
                {/* 뱃지는 이름 옆에 — b가 블록이라 사이에 두면 설명문 줄로 내려감 (v1.9 사용자 피드백) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b>{widgetLabel(state.widgets, w)}</b>
                  {MULTI_TYPES.includes(w.type) && <span className="pill">可添加多个</span>}
                </div>
                <small>{WIDGET_META[w.type].desc}</small>
              </div>
            </div>
            <KToggle checked={!w.mOff} onChange={v => setMobileOff(w.id, !v)} />
          </div>
        )}
      />
      <p className="hint">关闭开关后，组件<b>仅在移动端</b>隐藏，电脑端主页仍会显示。此处顺序仅影响<b>移动端纵向排列</b>；电脑端布局可在主页编辑模式中调整。</p>
      <p className="hint">要从主页完全移除或添加组件，请进入编辑模式：通过顶部栏 [＋ 添加组件] 添加，右键组件并选择“删除组件”移除。</p>
      <p className="hint">固定组件：轮播横幅（顶部）、用户信息；不包含在顺序列表中。</p>
    </div>
  );
}

/** 위젯 탭 — 메인 위젯들의 내용·설정값을 한곳에서 관리 (메인 페이지의 관리 모달과 같은 데이터) */
function WidgetsPane() {
  const { state } = useMainStore();
  // 설정값이 있는 위젯만 — 실데이터 연동 위젯(DIARY·LATEST·UPCOMING)과 메뉴리스트·회원정보창은 설정값 없음
  const editable = state.widgets.filter(w =>
    (['banner', 'memo', 'dday', 'ddaytext', 'todo', 'freetext', 'deco'] as const).some(t => t === w.type));

  const editorOf = (w: WidgetConf) => {
    switch (w.type) {
      case 'memo':
      case 'freetext': return <TextSettingEditor conf={w} />;
      case 'dday':
      case 'ddaytext': return <DdayEditor conf={w} />;
      case 'todo': return <TodoEditor conf={w} />;
      case 'deco': return <DecoEditor conf={w} />;
      case 'banner': return <BannerEditor conf={w} />;
      default: return null;
    }
  };

  return (
    <div className="set-sec">
      <h3>组件</h3>
      <div className="d">管理主页组件的内容和设置；与主页管理弹窗使用相同数据，任一处修改都会立即同步</div>

      {editable.map(w => (
        <div key={w.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            {/* 중복 추가 가능한 위젯(이미지·자유 텍스트)은 번호로 구분 (v1.9) */}
            <b style={{ fontSize: 13, letterSpacing: '.04em' }}>{widgetLabel(state.widgets, w)}</b>
            {MULTI_TYPES.includes(w.type) && <span className="pill">可添加多个</span>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{WIDGET_META[w.type].desc}</small>
            {w.mOff && <span className="pill" style={{ marginLeft: 'auto' }}>移动端隐藏</span>}
          </div>
          {editorOf(w)}
        </div>
      ))}
      <p className="hint">日记、最新作品和即将到来组件直接显示日记、绘图记录和日程数据，无需单独设置。组件显示状态和顺序请在“主页”分类中调整。</p>
    </div>
  );
}

/** 게시판 관리 탭 (5.2) — 게시판 생성·삭제·스킨·권한 + 게시판별 말머리 + 뱃지 색 */
function BoardPane() {
  const {
    st, patchSystem, patchGallery,
    patchGalleryCat, addGalleryCat, removeGalleryCat, setGalleryCats,
    patchVideoCat, addVideoCat, removeVideoCat, setVideoCats,
  } = useBoardSettings();
  const { boards, setBoards, patchBoard } = useBoards();
  const [catBoard, setCatBoard] = useState(MAIN_BOARD_ID);   // 말머리 편집 대상 게시판
  /* 갤러리 말머리도 갤러리마다 따로 (v2.0 사용자 요청) — 어느 갤러리 것을 고칠지 고른다.
     하나뿐이면 고를 것이 없으니 선택 줄을 아예 두지 않는다 (감상타래와 같은 방식) */
  const { list: secList } = useSections();
  const galSecs = secList('gallery');
  const [galSecSel, setGalSec] = useState(MAIN_SEC);
  const galSec = galSecs.some(s2 => s2.id === galSecSel) ? galSecSel : MAIN_SEC;
  const galCats = galleryCatsOf(st, galSec);
  /* 비디오 말머리 (커플홈 사용자 요청 — 갤러리처럼) — 비디오 게시판마다 따로 */
  const vidSecs = secList('videos');
  const [vidSecSel, setVidSec] = useState(MAIN_SEC);
  const vidSec = vidSecs.some(s2 => s2.id === vidSecSel) ? vidSecSel : MAIN_SEC;
  const vidCats = videoCatsOf(st, vidSec);
  const del = useConfirmDelete();

  const sel = boards.find(b => b.id === catBoard) ?? boards[0];
  const setCats = (cats: BoardBadge[]) => patchBoard(sel.id, { cats });
  const patchCat = (id: string, p: Partial<BoardBadge>) =>
    patchBoard(sel.id, { cats: sel.cats.map(c => (c.id === id ? { ...c, ...p } : c)) });

  const colorCells = (b: BoardBadge, patch: (p: Partial<BoardBadge>) => void) => (
    <>
      <span className="cp-lb">배경</span>
      <ColorField value={b.bg} onChange={hex => patch({ bg: hex })} />
      <span className="cp-lb">테두리</span>
      <ColorField value={b.border} onChange={hex => patch({ border: hex })} />
      <span className="cp-lb">글씨</span>
      <ColorField value={b.fg} onChange={hex => patch({ fg: hex })} />
    </>
  );

  return (
    <div className="set-sec">
      <h3>帖子管理</h3>
      <div className="d">创建或删除帖子区，并设置各区的样式、权限和分类；更改会立即应用于菜单、列表和发帖页</div>

      <h3 style={{ marginTop: 20 }}>帖子区列表</h3>
      <div className="d">拖动 ⠿ 调整菜单顺序。名称会显示在顶部菜单和页面标题中。可为各帖子区设置列表样式（标准/票券）；发帖和评论权限请在菜单管理中设置。</div>
      <DragList items={boards} keyOf={b => b.id} onReorder={setBoards}
        render={b => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={b.name} onChange={e => patchBoard(b.id, { name: e.target.value })}
                style={{ width: 110 }} />
              {b.id === MAIN_BOARD_ID && <span className="pill">默认</span>}
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <div className="mini-seg">
                {(['list', 'ticket'] as BoardSkin[]).map(s => (
                  <button key={s} className={b.skin === s ? 'on' : ''}
                    onClick={() => patchBoard(b.id, { skin: s })}>{s === 'list' ? '标准' : '票券'}</button>
                ))}
              </div>
              {/* 목록 글씨색 (v1.9) — 미지정이면 테마 기본색 */}
              <span className="cp-lb">글씨</span>
              <ColorField value={b.fg ?? '#2c3037'} onChange={hex => patchBoard(b.id, { fg: hex })} />
              {b.fg && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => patchBoard(b.id, { fg: undefined })}>默认颜色</button>
              )}
              {b.id !== MAIN_BOARD_ID && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => del.ask(`确定删除帖子区“${b.name}”吗？`, () => {
                    setBoards(boards.filter(x => x.id !== b.id));
                    if (catBoard === b.id) setCatBoard(MAIN_BOARD_ID);
                  }, '该帖子区将从菜单中移除，但其中的帖子数据会保留。')}>删除</button>
              )}
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setBoards([...boards, {
            id: newId(), name: '新帖子区', desc: '请输入帖子区说明',
            skin: 'list', permWrite: 'member', permComment: 'member', cats: DEFAULT_BOARD_CATS,
          }])}>＋ 添加帖子区</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>分类</h3>
      <div className="d">选择帖子区后，可拖动 ⠿ 调整顺序、修改名称或添加/删除分类。更改名称不会影响已有帖子中的旧名称。</div>
      {boards.length > 1 && (
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          {boards.map(b => (
            <button key={b.id} className={sel.id === b.id ? 'on' : ''} onClick={() => setCatBoard(b.id)}>{b.name}</button>
          ))}
        </div>
      )}
      <DragList items={sel.cats} keyOf={c => c.id} onReorder={setCats}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={boardBadgeStyle(c)}>{c.label || '分类'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })}
                style={{ width: 90, textAlign: 'right' }} />
              {colorCells(c, p => patchCat(c.id, p))}
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => del.ask(`确定删除分类“${c.label}”吗？`, () =>
                  patchBoard(sel.id, { cats: sel.cats.filter(x => x.id !== c.id) }),
                  '已有帖子会保留，并显示为中性色徽标。')}>删除</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...sel.cats, { id: newId(), label: '新分类', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }])}>＋ 添加</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>系统徽标</h3>
      <div className="d">公告、私密、折叠；仅可修改颜色，不可删除</div>
      {st.system.map(b => (
        <div key={b.id} className="set-row">
          <div className="l"><span style={boardBadgeStyle(b)}>{b.label}</span></div>
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            {colorCells(b, p => patchSystem(b.id, p))}
          </div>
        </div>
      ))}

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>图集类型徽标</h3>
      <div className="d">图集中的日志/单图标记；可修改名称和颜色，不可删除</div>
      {st.gallery.map(b => (
        <div key={b.id} className="set-row">
          <div className="l"><span style={boardBadgeStyle(b)}>{b.label || '类型'}</span></div>
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            <KInput value={b.label} onChange={e => patchGallery(b.id, { label: e.target.value })}
              style={{ width: 90, textAlign: 'right' }} />
            {colorCells(b, p => patchGallery(b.id, p))}
          </div>
        </div>
      ))}

      {/* 갤러리 말머리 (v2.0 사용자 요청) — 예전에는 코드에 박혀 있어 바꿀 수 없었다.
          여러 개로 만든 갤러리마다 따로 정한다 (v2.0 사용자 요청) */}
      <h3 style={{ marginTop: 20 }}>图集分类</h3>
      <div className="d">
        在图集发布页选择的分类；拖动 ⠿ 调整顺序，可自由添加、修改或删除
        {galSecs.length > 1 && <><br />每个图集可单独设置；<b>未修改时沿用默认图集的分类</b></>}
      </div>
      {galSecs.length > 1 && (
        <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {galSecs.map(s2 => (
            <button key={s2.id} className={galSec === s2.id ? 'on' : ''} onClick={() => setGalSec(s2.id)}>{s2.name}</button>
          ))}
        </div>
      )}
      <DragList items={galCats} keyOf={c => c.id} onReorder={next => setGalleryCats(galSec, next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={boardBadgeStyle(c)}>{c.label || '分类'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchGalleryCat(galSec, c.id, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              {colorCells(c, p => patchGalleryCat(galSec, c.id, p))}
              <span className="fx" data-tip="删除分类"
                onClick={() => del.ask(`确定删除分类“${c.label}”吗？`,
                  () => removeGalleryCat(galSec, c.id),
                  '已使用此分类发布的内容会保留。')}>✕</span>
            </div>
          </div>
        )} />
      <button className="btn btn-ghost" style={{ marginTop: 8, padding: '7px 14px', fontSize: 11 }}
        onClick={() => addGalleryCat(galSec)}>＋ 添加分类</button>

      {/* 비디오 말머리 (커플홈 사용자 요청 — "비디오도 갤러리처럼 카테고리 만들어주고 카테고리별로 탭") — 갤러리 말머리와 같은 방식 */}
      <h3 style={{ marginTop: 20 }}>视频分类</h3>
      <div className="d">
        在视频发布页选择的分类，会以 ALL / 分类标签显示在列表左侧；拖动 ⠿ 调整顺序，可自由添加、修改或删除
        {vidSecs.length > 1 && <><br />每个视频区可单独设置；<b>未修改时沿用默认区的分类</b></>}
      </div>
      {vidSecs.length > 1 && (
        <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {vidSecs.map(s2 => (
            <button key={s2.id} className={vidSec === s2.id ? 'on' : ''} onClick={() => setVidSec(s2.id)}>{s2.name}</button>
          ))}
        </div>
      )}
      <DragList items={vidCats} keyOf={c => c.id} onReorder={next => setVideoCats(vidSec, next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={boardBadgeStyle(c)}>{c.label || '分类'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchVideoCat(vidSec, c.id, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              {colorCells(c, p => patchVideoCat(vidSec, c.id, p))}
              <span className="fx" data-tip="删除分类"
                onClick={() => del.ask(`确定删除分类“${c.label}”吗？`,
                  () => removeVideoCat(vidSec, c.id),
                  '已使用此分类发布的视频会保留。')}>✕</span>
            </div>
          </div>
        )} />
      {vidCats.length === 0 && <div className="d" style={{ marginTop: 6 }}>暂无分类；添加后会在视频列表左侧显示标签</div>}
      <button className="btn btn-ghost" style={{ marginTop: 8, padding: '7px 14px', fontSize: 11 }}
        onClick={() => addVideoCat(vidSec)}>＋ 添加分类</button>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      {/* 갤러리·다이어리 등도 여러 개로 (v2.0 사용자 요청) — 목록이 몇 개인지는 여기 한곳에서 */}
      <SectionsBlock />

      {del.element}
    </div>
  );
}

/** 자관 질문 탭 (v1.9) — 질문 세트(CP/NCP) 관리. 자관 상세의 QUESTIONS 섹션 추가 시 세트를 골라 넣는다 */
/** 캐릭터 탭 (커플홈) — 캐릭터 목록 페이지를 없애서, 자관에 연결되지 않은 캐릭터는 들어갈 길이 없었다.
 *  관리자만 여기서 전체를 보고 열기·수정·삭제한다. 삭제하면 들어가 있던 자관에서도 함께 빠진다 */
function CharPane() {
  const router = useRouter();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels, setRels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const pool = useMembers();
  const del = useConfirmDelete();
  const relsOf = (id: string) => rels.filter(r => r.members.some(m => m.charId === id));
  // 내 캐릭터 먼저, 그다음 상대 캐릭터 — 각각은 저장 순서 그대로
  const list = [...chars.filter(c => c.own), ...chars.filter(c => !c.own)];
  const remove = (c: Character) => {
    const linked = relsOf(c.id);
    del.ask(`「${c.name}」 캐릭터를 삭제하시겠습니까?`, () => {
      setChars(chars.filter(x => x.id !== c.id));
      const nextRels = relsWithoutChar(rels, c.id);
      if (nextRels) setRels(nextRels);
    }, linked.length
      ? `프로필·탭이 함께 삭제되고 자관 「${linked.map(r => r.name).join('」·「')}」에서도 빠집니다. 복구할 수 없습니다.`
      : '프로필·탭이 함께 삭제되며 복구할 수 없습니다.');
  };
  const smallBtn = { padding: '3px 9px', fontSize: 10.5 };
  return (
    <div className="set-sec">
      <h3>角色</h3>
      <div className="d">所有角色；未关联到角色关系的角色也可在此查看、修改或删除</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => router.push(`/chars/new?next=${encodeURIComponent('/settings?tab=캐릭터')}`)}>＋ 创建角色</button>
      </div>
      {list.map(c => {
        const linked = relsOf(c.id);
        const granted = (c.grants ?? []).map(g => pool.find(m => m.id === g.userId)?.nickname ?? g.userId);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 2px', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ width: 34, aspectRatio: '3/4', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
              <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass} phStyle={phStyle([c.color])} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}><span className="dot-lbl"><i className="cmt-dot" style={{ background: c.color }} />{c.name}</span></b>
              {c.sub && <small style={{ marginLeft: 7, color: 'var(--faint)', fontSize: 11 }}>{c.sub}</small>}
              <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 3 }}>
                {c.own ? '我的角色' : '对方角色'}
                {linked.length > 0
                  ? ` · 자관 ${linked.map(r => r.name).join(', ')}`
                  : <b style={{ color: 'var(--accent)' }}> · 未关联角色关系</b>}
                {granted.length > 0 && ` · 权限：${granted.join(', ')}`}
                {c.visibility !== 'public' && ` · ${c.visibility === 'member' ? '成员可见' : '私密'}`}
              </div>
            </div>
            <button className="btn btn-ghost" style={smallBtn} onClick={() => router.push(charPath(c))}>打开</button>
            <button className="btn btn-ghost" style={smallBtn} onClick={() => router.push(`/chars/${c.id}/edit`)}>修改</button>
            <button className="btn btn-ghost" style={smallBtn} onClick={() => remove(c)}>删除</button>
          </div>
        );
      })}
      {loaded && list.length === 0 && <p className="hint">暂无已创建的角色</p>}
      {del.element}
    </div>
  );
}

function RelQPane() {
  const [sets, setSets] = useLocalList<RelQuestionSet>(RELQ_KEY, RELQ_SEED);
  const [selId, setSelId] = useState<string | null>(null);
  const del = useConfirmDelete();
  const relqToast = useToast();
  const txtRef = useRef<HTMLInputElement>(null);   // txt 일괄 업로드 (줄바꿈 = 질문)
  const sel = sets.find(s => s.id === selId) ?? sets[0];
  const patchSet = (id: string, p: Partial<RelQuestionSet>) =>
    setSets(sets.map(s => (s.id === id ? { ...s, ...p } : s)));

  // 질문은 txt로 수백 개씩 올리는 경우가 있어 한 화면에 다 깔면 끝없이 길어진다 (v2.0 사용자 요청)
  const PER_Q = 12;
  const [qPage, setQPage] = useState(1);
  const qTotal = sel?.questions.length ?? 0;
  const qPages = Math.max(1, Math.ceil(qTotal / PER_Q));
  // 세트를 바꾸거나 질문이 줄어 페이지가 사라지면 마지막 페이지로 당긴다
  const qCur = Math.min(qPage, qPages);
  useEffect(() => { setQPage(1); }, [sel?.id]);
  const qStart = (qCur - 1) * PER_Q;
  // 화면에 보이는 건 이 페이지뿐이라, 수정·삭제·정렬은 전체 배열 기준 위치로 되돌려 계산해야 한다
  const qShown = (sel?.questions ?? []).slice(qStart, qStart + PER_Q);
  return (
    <div className="set-sec">
      <h3>关系问答</h3>
      <div className="d">按 CP（配对）/NCP（非配对）管理问答集；在角色关系详情页添加 QUESTIONS 区块时选择问答集</div>

      <h3 style={{ marginTop: 20 }}>问答集</h3>
      <div className="d">可自定义名称、设置 CP/NCP 类型，并拖动 ⠿ 调整顺序</div>
      <DragList items={sets} keyOf={s => s.id} onReorder={setSets}
        render={s => (
          /* 컴팩트 행 (v1.9 — 위아래 여백 최소) */
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '3px 0' }}>
            <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
            <KInput value={s.name} onChange={e => patchSet(s.id, { name: e.target.value })}
              style={{ width: 140, fontSize: 12, padding: '5px 10px' }} />
            <div className="mini-seg">
              {(['cp', 'ncp'] as const).map(t => (
                <button key={t} className={s.cat === t ? 'on' : ''}
                  onClick={() => patchSet(s.id, { cat: t })}>{CP_LABEL[t]}</button>
              ))}
            </div>
            <small style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 10.5 }}>{s.questions.length} 个问题</small>
            <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
              onClick={() => del.ask(`确定删除问答集“${s.name}”吗？`,
                () => setSets(sets.filter(x => x.id !== s.id)),
                '已添加到角色关系中的问题会保留。')}>删除</button>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setSets([...sets, { id: newId(), name: '新问答集', cat: 'cp', questions: [] }])}>＋ 添加问答集</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>问题列表</h3>
      <div className="d">TXT 文件按换行符拆分问题。</div>
      {sets.length > 1 && (
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          {sets.map(s => (
            <button key={s.id} className={sel?.id === s.id ? 'on' : ''} onClick={() => setSelId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      {sel && (
        <>
          {/* 정렬은 이 페이지 안에서만 — 되돌려 담을 때 앞뒤 페이지는 그대로 둔다 */}
          <DragList items={qShown.map((q, i) => ({ q, key: `${sel.id}-${qStart + i}` }))} keyOf={x => x.key}
            onReorder={list => patchSet(sel.id, {
              questions: [
                ...sel.questions.slice(0, qStart),
                ...list.map(x => x.q),
                ...sel.questions.slice(qStart + PER_Q),
              ],
            })}
            render={({ q }, i) => {
              const gi = qStart + i;   // 전체 배열에서의 실제 위치
              return (
              /* 컴팩트 행 — 질문이 100개 단위라 갭 최소화 (v1.9) */
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '2px 0' }}>
                <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
                <small style={{ color: 'var(--faint)', fontSize: 10, minWidth: 26, textAlign: 'right' }}>{gi + 1}</small>
                <KInput value={q}
                  onChange={e => patchSet(sel.id, { questions: sel.questions.map((x, j) => (j === gi ? e.target.value : x)) })}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '5px 10px' }} />
                <span className="fx" style={{ fontSize: 10, padding: '2px 4px' }}
                  onClick={() => {
                    // 내용이 있으면 경고 모달, 방금 추가한 빈 줄은 바로 삭제
                    const remove = () => patchSet(sel.id, { questions: sel.questions.filter((_, j) => j !== gi) });
                    if (q.trim()) del.ask('确定删除此问题吗？', remove, `“${q.slice(0, 40)}${q.length > 40 ? '…' : ''}”`);
                    else remove();
                  }}>✕</span>
              </div>
              );
            }} />
          {/* 개수는 완전히 오른쪽 끝으로, 페이저는 가운데 그대로 (v2.0 사용자 요청) —
              한 줄에 나란히 두면 개수만큼 페이저가 왼쪽으로 밀려 가운데가 어긋난다 */}
          {qTotal > PER_Q && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
              <span />
              <Pager page={qCur} total={qPages} onChange={setQPage} />
              <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>共 {qTotal} 个</small>
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {/* txt 일괄 업로드 — 엔터 기준 한 줄 = 질문 하나 (v1.9, 100개 단위 대비) */}
            <input ref={txtRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                const lines = (await f.text()).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                if (lines.length === 0) { relqToast('文件中没有找到问题'); return; }
                patchSet(sel.id, { questions: [...sel.questions, ...lines] });
                relqToast(`已导入 ${lines.length} 个问题`);
              }} />
            <button className="btn btn-dark" style={{ padding: '5px 12px', fontSize: 11 }}
              onClick={() => txtRef.current?.click()}>↑ 上传 TXT</button>
            <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
              onClick={() => {
                patchSet(sel.id, { questions: [...sel.questions, ''] });
                // 새 빈 줄은 맨 끝에 붙으므로 그 줄이 있는 페이지로 옮겨 준다 (안 그러면 눌러도 안 보인다)
                setQPage(Math.ceil((qTotal + 1) / PER_Q));
              }}>＋ ADD</button>
          </div>
        </>
      )}
      {del.element}
    </div>
  );
}

/** 회원/보안 탭 (5.2, v1.9 mock 범위) — 가입코드 변경 + 회원 목록(가입 계정 삭제).
 *  그룹별 권한 매트릭스·가입 승인제·비밀번호 정책은 Supabase 연동 시 확장 */
function MemberPane() {
  const toast = useToast();
  const del = useConfirmDelete();
  const router = useRouter();   // 회원 이름 클릭 → 회원 정보 페이지 (v1.9)
  const [code, setCode] = useState('');
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [regVer, setRegVer] = useState(0);   // 가입 계정 삭제 후 목록 갱신용
  const [removedIds, setRemovedIds] = useState<string[]>([]);   // 서버 모드에서 방금 지운 회원
  // 가입코드 — 서버 모드에서는 **이 자관(홈)의 코드**(homes/{id}.inviteCode), 로컬 모드는 예전 설정 키 (v2.1)
  useEffect(() => {
    const be = backend();
    const home = currentHomeId();
    if (!be || !home) { setCode(inviteCode()); setCodeLoaded(true); return; }
    be.listHomes()
      .then(hs => { setCode(hs.find(h => h.id === home)?.inviteCode ?? ''); })
      .catch(() => { /* 못 받으면 빈 칸 */ })
      .finally(() => setCodeLoaded(true));
  }, []);
  void regVer;

  const members = useMembers();
  const serverOn2 = isServerMode();
  // 계정 삭제는 서비스 콘솔에서만 가능 — 바로 열 수 있게 이 홈의 프로젝트 주소를 만들어 둔다
  const authConsoleUrl = (() => {
    const c = serverConfig();
    if (c?.kind === 'firebase') return `https://console.firebase.google.com/project/${c.projectId}/authentication/users`;
    if (c?.kind === 'supabase') {
      const m = c.url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
      return m ? `https://supabase.com/dashboard/project/${m[1]}/auth/users` : '';
    }
    return '';
  })();
  const [delMember, setDelMember] = useState<{ id: string; nickname: string } | null>(null);
  const registry = (() => {
    try { return JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as Record<string, unknown>; } catch { return {}; }
  })();

  // 회원 목록 — 검색 · 10명 페이지네이션 · 태그 그룹화 (v1.9)
  const PER_MEMBERS = 10;
  const [mq, setMq] = useState('');
  const [mPage, setMPage] = useState(1);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [mTags, setMTags] = useState<Record<string, string[]>>({});
  const [tagFor, setTagFor] = useState<string | null>(null);   // 태그 입력 중인 회원
  const [tagInput, setTagInput] = useState('');
  // 회원 태그는 관리자가 정하고 모두가 보는 값 — 서버 모드에서는 DB에 저장 (v2.0)
  useEffect(() => { setMTags(getSetting<Record<string, string[]>>('ohome.membertags.v1', {})); }, []);
  const saveTags = (userId: string, tags: string[]) => {
    setMTags(prev => {
      const n = { ...prev };
      if (tags.length) n[userId] = tags; else delete n[userId];
      setSetting('ohome.membertags.v1', n);
      return n;
    });
  };
  const allTags = [...new Set(Object.values(mTags).flat())];
  const isAdminOf = (m: { id: string; role?: string }) => m.role === 'admin' || m.id === 'admin';
  const filteredMembers = members.filter(m => {
    if (removedIds.includes(m.id)) return false;   // 방금 지운 회원 (목록은 한 번만 받아 온다)
    const k = mq.trim().toLowerCase();
    const tags = mTags[m.id] ?? [];
    if (filterTag && !tags.includes(filterTag)) return false;
    return !k || m.nickname.toLowerCase().includes(k) || m.id.toLowerCase().includes(k)
      || tags.some(t => t.toLowerCase().includes(k));
  })
    // 관리자를 맨 위로 (사용자 요청) — 그 다음은 이름순
    .sort((a, b) => (isAdminOf(a) ? 0 : 1) - (isAdminOf(b) ? 0 : 1) || a.nickname.localeCompare(b.nickname));
  const pageMembers = filteredMembers.slice((mPage - 1) * PER_MEMBERS, mPage * PER_MEMBERS);

  return (
    <div className="set-sec">
      <h3>成员与安全</h3>
      <div className="d">管理邀请码和成员列表</div>

      {/* 다른 탭 행들과 같은 .set-row — 라벨은 왼쪽, 입력·버튼은 같은 줄 오른쪽 (v2.0 사용자 지적:
          예전엔 라벨·설명·컨트롤이 각자 줄을 차지해 다른 탭과 통일감이 없고 줄바꿈도 보기 안 좋았다) */}
      <div className="set-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="l"><b>邀请码</b><small>注册时必须填写的代码，请仅分享给可信任的人</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <KInput value={code} onChange={e => setCode(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-dark" disabled={!codeLoaded}
            onClick={async () => {
              if (!code.trim()) { toast('请输入邀请码'); return; }
              const be = backend();
              const home = currentHomeId();
              if (be && home) {
                try { await be.updateHome(home, { inviteCode: code.trim() }); }
                catch (e) { toast(`保存失败：${(e as { message?: string })?.message ?? ''}`); return; }
              } else {
                setInviteCode(code);
              }
              toast('邀请码已更新');
            }}>SAVE</button>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>成员列表</h3>
      <div className="d">默认账号（管理员和访客）不可删除；可使用标签分组</div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l">
          {allTags.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allTags.map(t => (
                <span key={t} className={`pill${filterTag === t ? ' dark' : ''}`} style={{ cursor: 'var(--cur-pointer,pointer)' }}
                  onClick={() => { setFilterTag(f => (f === t ? null : t)); setMPage(1); }}>{t}</span>
              ))}
            </div>
          ) : <b>按标签筛选</b>}
        </div>
        <KInput placeholder="搜索昵称、账号或标签" value={mq}
          onChange={e => { setMq(e.target.value); setMPage(1); }}
          style={{ width: 200, fontSize: 12 }} />
      </div>
      {pageMembers.map(m => {
        const isBase = m.id === 'admin' || m.id === 'guest';
        const myTags = mTags[m.id] ?? [];
        return (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            {/* 이름 클릭 → 회원 정보 페이지 (v1.9) */}
            <b style={{ fontSize: 12.5, cursor: 'var(--cur-pointer,pointer)' }} data-tip="查看成员信息"
              onClick={() => router.push(`/members/${m.id}`)}>{m.nickname}</b>
            {/* Firebase 계정 id(uid)는 28자라 줄에서 자리를 다 먹는다 — 앞 7자만, 전체는 툴팁으로 */}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }} data-tip={m.id.length > 7 ? m.id : undefined}>
              {m.id.length > 7 ? `${m.id.slice(0, 7)}…` : m.id}
            </small>
            {/* 태그 — ✕로 제거, ＋로 추가 (그룹화) */}
            {myTags.map(t => (
              <span key={t} className="pill" style={{ cursor: 'var(--cur-pointer,pointer)' }} data-tip="移除标签"
                onClick={() => del.ask(`确定移除标签“${t}”吗？`,
                  () => saveTags(m.id, myTags.filter(x => x !== t)),
                  `此操作仅会从成员 ${m.nickname} 的资料中移除该标签。`)}>
                {t} <span style={{ fontSize: 8 }}>✕</span>
              </span>
            ))}
            {tagFor === m.id ? (
              <KInput autoFocus placeholder="标签" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onBlur={() => setTagFor(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    saveTags(m.id, [...new Set([...myTags, tagInput.trim()])]);
                    setTagInput(''); setTagFor(null);
                  }
                  if (e.key === 'Escape') setTagFor(null);
                }}
                style={{ width: 90, fontSize: 11, padding: '3px 8px' }} />
            ) : (
              <span className="fx" style={{ fontSize: 10 }} data-tip="添加标签"
                onClick={() => { setTagFor(m.id); setTagInput(''); }}>＋</span>
            )}
            <span className="pill" style={{ marginLeft: 'auto' }}>{isAdminOf(m) ? '管理员' : '成员'}</span>
            {!isBase && !isAdminOf(m) && (
              // 회원 뱃지(.pill)와 같은 규격 — padding·글씨·radius 동일 (v1.9)
              <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5, borderRadius: 20, lineHeight: 'normal', letterSpacing: '.04em' }}
                onClick={() => {
                  // 서버 모드는 계정 삭제가 콘솔 소관이라 안내를 거치는 모달로 (사용자 확정)
                  if (serverOn2) { setDelMember({ id: m.id, nickname: m.nickname }); return; }
                  del.ask(`确定删除成员“${m.nickname}”的账号吗？`, () => {
                    const reg = { ...registry };
                    delete reg[m.id];
                    try { localStorage.setItem('ohome.mockreg.v1', JSON.stringify(reg)); } catch { /* 무시 */ }
                    setRegVer(v => v + 1);
                    toast('账号已删除');
                  }, '该账号将无法再次登录，已发布的内容会保留。');
                }}>删除</button>
            )}
          </div>
        );
      })}
      {filteredMembers.length === 0 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>没有符合条件的成员</p>
      )}
      {filteredMembers.length > PER_MEMBERS && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <Pager page={mPage} total={Math.ceil(filteredMembers.length / PER_MEMBERS)} onChange={setMPage} />
        </div>
      )}
      {/* 회원 내보내기 — 계정 삭제는 콘솔에서만 되므로 두 단계를 한 흐름으로 안내 (v2.0 사용자 확정) */}
      <ConfirmModal open={delMember !== null} title={`移除成员“${delMember?.nickname ?? ''}”`}
        wide
        body={
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}>
              <b>① 先删除登录账号。</b><br />
              删除账号需要管理员权限，无法在主页中完成。
              （若允许在此操作，主页中的管理员密钥会暴露，任何人都可能删除他人账号。）
              请使用下方按钮打开控制台，删除 <b>{delMember?.nickname}</b> 的账号。
            </p>
            <p style={{ margin: 0 }}>
              <b>② 然后从成员列表中移除。</b><br />
              如果只从列表移除而不删除账号，<b>该成员仍可登录。</b>
              无论如何处理，已发布的内容都会保留。
            </p>
          </div>
        }
        onClose={() => setDelMember(null)}
        buttons={[
          ...(authConsoleUrl ? [{
            label: '① 在控制台删除账号 ↗', kind: 'dark' as const,
            onClick: () => window.open(authConsoleUrl, '_blank', 'noopener'),
          }] : []),
          {
            label: '② 从列表中移除', kind: 'accent' as const,
            onClick: () => {
              const t = delMember;
              setDelMember(null);
              if (!t) return;
              void backend()?.deleteMember(t.id)
                .then(() => { setRemovedIds(v => [...v, t.id]); toast('已从成员列表中移除'); })
                .catch(() => toast('移除失败，请确认当前登录的是管理员账号'));
            },
          },
          { label: 'CANCEL', kind: 'ghost' as const, onClick: () => setDelMember(null) },
        ]} />
      {del.element}
      {/* 포크는 GitHub이 자동으로 동기화해 주지 않는다 — 원본 저장소에 업데이트가 올라와도
          내 포크·배포에는 반영 안 된 채로 남는다(오늘 만든 기능이 안 보이는 흔한 원인, v2.0 사용자 요청).
          자격 증명은 전혀 다루지 않고, 저장해 둔 내 포크 주소로 이동만 시켜 준다 — 거기서
          [Sync fork] 버튼 한 번이면 끝 */}
      {serverOn2 && <ConfigScopeWarnRow />}
      {serverOn2 && <ForkUpdateRow />}
      {/* 설치를 이미 마친 뒤에도 보안 규칙이 바뀔 때(버전 업데이트 등) 다시 붙여넣을 수 있게 —
          예전엔 최초 설치 화면에만 있어서 재설치 없이는 갱신된 규칙을 볼 방법이 없었다 (v2.0) */}
      {serverOn2 && <SecurityRulesRow />}
    </div>
  );
}

/** 연결이 이 브라우저에만 저장된 상태 경고 (v2.0 포크 제보 — 「내 브라우저에선 홈이 뜨는데
 *  배포 링크로 들어온 사람에게는 설치 화면이 뜬다」). 설치 마지막 단계(방문자에게도 보이게 하기)를
 *  건너뛰면 다시 알려 주는 곳이 없어 일주일씩 헤매게 된다 — 관리자가 설정에 들어오면 바로 보이게 */
function ConfigScopeWarnRow() {
  const src = serverConfigSource();
  const cfg = serverConfig();
  if (src !== 'local' || !cfg) return null;
  const download = () => {
    const blob = new Blob([configFileText(cfg)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };
  return (
    <div className="set-sec" style={{ marginTop: 26, border: '1.5px solid var(--accent)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ color: 'var(--accent)' }}>访客仍会看到安装页面</h3>
      <div className="d" style={{ lineHeight: 1.7 }}>
        数据库连接信息<b>仅保存在此浏览器中</b>。其他人访问部署地址时，会看到“首次打开”安装页面，而不是主页。
        下载下方文件，上传到<b>仓库的 public 文件夹</b>并提交（约 1 到 2 分钟后自动重新部署），访客即可访问同一主页。这些是公开配置信息，公开也安全。
        <br />
        打开<b>部署地址/ohome.config.json</b>，如果能看到配置内容，就表示已生效。
      </div>
      <div className="setup-row" style={{ marginTop: 10 }}>
        <button className="btn btn-dark" onClick={download}>下载 ohome.config.json</button>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        也可以不上传文件，而是在 Vercel → Settings → Environment Variables 中设置环境变量；操作与安装页面的最后一步相同。
      </p>
    </div>
  );
}

/** 포크 업데이트 바로가기 (v2.0 사용자 요청) — 토큰이나 GitHub 로그인 연동 없이, 저장해 둔 내 포크
 *  주소로 한 번에 이동시켜 준다. 자격 증명을 전혀 다루지 않아 가장 안전하고 구현도 간단하다 —
 *  실제 업데이트(Sync fork)는 그 페이지에서 사용자가 직접 누른다 */
function ForkUpdateRow() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setUrl(getSetting<string>('ohome.repo.v1', '')); setLoaded(true); }, []);
  const trimmed = url.trim();
  const valid = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i.test(trimmed);
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>同步 Fork 更新</h3>
      <div className="d">
        保存 Fork 仓库地址后，原仓库发布更新时可直接打开 GitHub 的 [Sync fork] 页面
      </div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>我的 Fork 地址</b><small>在 GitHub 上 Fork 的仓库地址</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <KInput placeholder="https://github.com/账号/O.home" value={url} onChange={e => setUrl(e.target.value)} style={{ width: 250 }} />
          <button className="btn btn-ghost" disabled={!loaded}
            onClick={() => { setSetting('ohome.repo.v1', trimmed); toast('已保存'); }}>保存</button>
          <button className="btn btn-dark" disabled={!valid}
            onClick={() => window.open(trimmed, '_blank', 'noopener')}>打开我的 Fork ↗</button>
        </div>
      </div>
    </div>
  );
}

/** 보안 규칙 다시 보기 (v2.0) — 최초 설치 이후에도, 앱 업데이트로 규칙이 바뀌면 다시 붙여넣어야 한다.
 *  설치 화면과 같은 내용을 여기서도 복사할 수 있게 */
function SecurityRulesRow() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const cfg = serverConfig();
  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setOpen(true);
    }
  };
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>安全规则</h3>
      <div className="d">
        应用更新时，安全规则可能会变更。如果新功能突然不可用、列表为空或保存被拒绝，请重新应用下方规则。{' '}
        {cfg?.kind === 'firebase'
          ? '可以直接覆盖 Firestore 控制台中的规则（现有集合权限会保留）。'
          : '完整粘贴到 Supabase 控制台 → SQL Editor 后点击 Run。重复执行也安全（已存在的对象会跳过，现有帖子和成员不受影响）。'}
      </div>
      {cfg?.kind === 'firebase' ? (
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
            {copied === 'fs' ? '已复制 ✓' : '复制 Firestore 规则'}
          </button>
          <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
            {copied === 'st' ? '已复制 ✓' : '复制 Storage 规则'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '收起内容' : '查看内容'}</button>
        </div>
      ) : (
        /* Supabase도 여기서 바로 복사 (v2.0 포크 제보) — 예전에는 「schema.sql을 실행하라」는
           안내 한 줄뿐이라, 규칙을 다시 적용하러 온 사람이 빈 화면을 만났다 */
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
            {copied === 'sql' ? '已复制 ✓' : '复制安装 SQL'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '收起内容' : '查看内容'}</button>
        </div>
      )}
      {open && (cfg?.kind === 'firebase' ? (
        <>
          <pre className="setup-sql">{FIRESTORE_RULES}</pre>
          <pre className="setup-sql">{STORAGE_RULES}</pre>
        </>
      ) : (
        <pre className="setup-sql">{SCHEMA_SQL}</pre>
      ))}
    </div>
  );
}

/** 무드 리스트 탭 (5.2 — 다이어리 무드: 이름/아이콘/색 추가·수정·삭제·순서) */
/** 다이어리 구분 탭 (커플홈 사용자 요청) — 무드 말고도 일기를 나눠 보는 탭. 이름 · ⠿ 순서 · 삭제 */
function DiaryCatPane() {
  const [dset, patch] = useDiarySettings();
  const [diaries] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const { list: secList } = useSections();
  const diarySecs = secList('diary');
  const del = useConfirmDelete();
  const setCats = (cats: DiaryCat[]) => patch({ cats });
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      {/* 자관 연결 (커플홈 사용자 요청) — 다이어리마다 칸을 나눌 자관. 여러 개로 만든 다이어리는 각각 고른다 */}
      <h3>关联角色关系</h3>
      <div className="d">
        日记会按所关联角色关系中的左右角色分栏；未选择时使用第一个角色关系。
        如需创建多个日记区，请前往帖子管理中的“创建多个列表”
      </div>
      {diarySecs.map(s => (
        <div key={s.id} className="set-row" style={{ width: '100%' }}>
          <div className="l"><b>{s.name}</b>{s.id === MAIN_SEC && <span className="pill" style={{ marginLeft: 8 }}>默认</span>}</div>
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            <KSelect minWidth={200} value={dset.relBySec?.[s.id] ?? ''}
              onChange={v => {
                const next = { ...(dset.relBySec ?? {}) };
                if (v) next[s.id] = v; else delete next[s.id];
                patch({ relBySec: next });
              }}
              options={[
                { value: '', label: '自动 — 第一个角色关系' },
                ...rels.map(r => ({ value: r.id, label: r.name })),
              ]} />
          </div>
        </div>
      ))}

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      <h3>分类标签</h3>
      <div className="d">显示在日记顶部的分类标签，写日记时选择；拖动 ⠿ 调整顺序。关联 AU 后，该标签中的角色会显示为对应 AU 形象。</div>
      <DragList items={dset.cats} keyOf={c => c.id} onReorder={setCats}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={c.name} onChange={e => setCats(dset.cats.map(x => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                style={{ width: 160 }} />
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              {/* 연결할 AU (커플홈 사용자 요청) — 이 구분 탭에서는 칸 머리의 캐릭터가 그 AU 모습(이름·사진·색)으로 보인다 */}
              <KSelect minWidth={170} maxWidth={240} value={c.auKey ?? ''}
                onChange={v => setCats(dset.cats.map(x => (x.id === c.id ? { ...x, auKey: v || undefined } : x)))}
                options={[
                  { value: '', label: '无 AU（原设）' },
                  ...rels.flatMap(r => r.aus.filter(a => a.id !== 'base').map(a => ({ value: `${r.id}:${a.id}`, label: `${r.name} · ${a.label}` }))),
                ]} />
              <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{diaries.filter(d => d.catId === c.id).length} 篇日记</small>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                  const used = diaries.filter(d => d.catId === c.id).length;
                  del.ask(`确定删除分类“${c.name}”吗？`, () => setCats(dset.cats.filter(x => x.id !== c.id)),
                    used > 0 ? `此分类下的 ${used} 篇日记会保留，并显示为“无分类”。` : undefined);
                }}>删除</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...dset.cats, { id: newId(), name: '新分类' }])}>＋ 添加</button>
      </div>
      {del.element}
    </div>
  );
}

function MoodPane() {
  const [moods, setMoods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [diaries] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const del = useConfirmDelete();
  const patchMood = (id: string, p: Partial<Mood>) =>
    setMoods(moods.map(m => (m.id === id ? { ...m, ...p } : m)));
  return (
    <div className="set-sec">
      <h3>心情列表</h3>
      <div className="d">在日记中选择的心情；可设置名称、图标（表情/特殊字符）和颜色，并拖动 ⠿ 调整顺序</div>

      <DragList items={moods} keyOf={m => m.id} onReorder={setMoods}
        render={m => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={{
                width: 30, height: 30, borderRadius: '50%',
                // 줄높이 1 — 상자가 아니라 글자를 가운데로 (v2.0 사용자 발견)
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                background: moodTint(m.color), color: m.color, fontSize: 14,
              }}>{m.icon}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              {/* 아이콘 — 클릭하면 특수문자 프리셋, 직접 입력도 가능 (v1.9) */}
              <SymbolInput value={m.icon} onChange={v => patchMood(m.id, { icon: v })}
                style={{ width: 46, textAlign: 'center' }} />
              <KInput value={m.name} onChange={e => patchMood(m.id, { name: e.target.value })}
                style={{ width: 110 }} />
              <ColorField value={m.color} onChange={hex => patchMood(m.id, { color: hex })} />
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                const used = diaries.filter(d => d.moodId === m.id).length;
                del.ask(`确定删除心情“${m.name}”吗？`, () => setMoods(moods.filter(x => x.id !== m.id)),
                  used > 0 ? `使用此心情的 ${used} 篇日记会保留，但图标将恢复为默认显示。` : undefined);
              }}>删除</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setMoods([...moods, { id: newId(), name: '新心情', icon: '✦', color: '#8a8f98' }])}>
          ＋ 添加心情
        </button>
      </div>
      {del.element}
    </div>
  );
}

/** 로고 컨트롤 (5.2) — 디자인 탭 로고 행에 삽입 */
/** 브라우저 탭 제목 (v1.9 사용자 요청) — 다른 로고 설정과 같은 드래프트/SAVE 흐름 */
function DocTitleControl() {
  const { site, set } = useSiteDraft();
  return (
    // 값이 드래프트 저장소를 거쳐 되돌아오므로 한글 조합이 깨지지 않는 인풋을 쓴다
    <LiveInput value={site.docTitle ?? ''} onValue={v => set({ docTitle: v })}
      placeholder={`${site.title} — 个人主页`}
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 크롤링 설명 문구 (v2.0 사용자 요청) — 카톡·디스코드 등 링크 공유 시 제목 아래 뜨는 설명줄.
 *  탭 제목과 같은 자리(디자인 탭)에 바로 이어서 둔다 */
function CrawlDescControl() {
  const { site, set } = useSiteDraft();
  return (
    <LiveInput value={site.crawlDesc ?? ''} onValue={v => set({ crawlDesc: v })}
      placeholder="角色创作个人档案"
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 브라우저 탭 아이콘 (v2.0 사용자 요청) — 지정 전에는 기본 아이콘(배포 기본값)이 뜬다.
 *  탭 제목 바로 아래에 같은 드래프트/SAVE 흐름으로 둔다. */
function FaviconControl() {
  const { site, set } = useSiteDraft();
  const toast = useToast();
  const url = useBlobUrl(site.favicon);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{
        width: 35, height: 35, borderRadius: 'var(--radius-s)', border: '1px solid var(--line)',
        background: 'var(--panel)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 10, color: 'var(--faint)' }}>默认</span>}
      </span>
      <input id="siteFavicon" type="file" accept="image/png,image/x-icon,image/svg+xml,image/webp,.ico"
        style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          // 올리기가 막히면 아무 말 없이 끝나지 않게 (v2.0 — 프로필 사진에서 겪은 것과 같은 이유)
          try { set({ favicon: await putBlob(f) }); } catch (err) {
            toast(`图标上传至存储失败：${err instanceof Error ? err.message : String(err)}`);
          }
        }} />
      <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
        onClick={() => document.getElementById('siteFavicon')?.click()}>
        {site.favicon ? '更换' : '上传'}
      </button>
      {site.favicon && (
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          onClick={() => set({ favicon: undefined })}>移除</button>
      )}
    </div>
  );
}

function LogoControls() {
  // 드래프트로만 반영 (v1.9) — 미리보기 즉시, 저장은 디자인 탭 SAVE에서
  const { site, set } = useSiteDraft();
  return (
    <>
      {/* 로고 문구도 드래프트를 거쳐 되돌아오므로 한글 조합에 안전한 인풋으로 */}
      <LiveInput value={site.title} onValue={v => set({ title: v })}
        style={{ width: 130, height: 35, boxSizing: 'border-box' }} />
      <LiveInput value={site.subtitle} onValue={v => set({ subtitle: v })}
        style={{ width: 160, height: 35, boxSizing: 'border-box' }} />
      <div className="mini-seg">
        {(['left', 'center', 'right'] as const).map(a => (
          <button key={a} className={site.align === a ? 'on' : ''} onClick={() => set({ align: a })}>
            {a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}
          </button>
        ))}
      </div>
    </>
  );
}

/** 커서 이미지 규격 맞추기 (v1.9 사용자 발견) — 브라우저는 128px를 넘는 이미지를 커서로 쓰지 못하고
 *  그냥 무시해 버려서, 커스텀 커서가 곳곳에서 시스템 커서로 되돌아가 "깨져 보이는" 원인이 된다.
 *  .cur/.ani는 자체 포맷이라 그대로 두고, 일반 이미지만 128px 이내로 줄인다. */
async function fitCursorImage(f: File): Promise<{ blob: Blob; resized: boolean }> {
  if (/\.(cur|ani)$/i.test(f.name)) return { blob: f, resized: false };
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = no; i.src = url;
    });
    const max = Math.max(img.width, img.height);
    if (max <= 128) return { blob: f, resized: false };
    const k = 128 / max;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/png'));
    return blob ? { blob, resized: true } : { blob: f, resized: false };
  } catch {
    return { blob: f, resized: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 마우스 커서 탭 (5.1 v1.1) — 상태별 이미지 + 핫스팟 + 전체 on/off */
function CursorRow({ state }: { state: CursorState }) {
  const [st, patch] = useCursorSettings();
  const toast = useToast();
  const entry = st.states[state];
  // .ani는 <img>로 표시되지 않아 첫 프레임(.cur)을 뽑아 미리보기 (v1.9)
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!entry?.imgId) { setUrl(null); return; }
    let cancelled = false;
    let obj: string | null = null;
    getBlob(entry.imgId).then(async b => {
      if (!b || cancelled) return;
      const ani = parseAni(await b.arrayBuffer());
      if (cancelled) return;
      obj = URL.createObjectURL(ani ? ani.frames[0] : b);
      setUrl(obj);
    });
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj); };
  }, [entry?.imgId]);
  const inputId = `curFile-${state}`;
  const setEntry = (p: Partial<{ imgId: string; hx: number; hy: number }>) =>
    patch({ states: { ...st.states, [state]: { imgId: entry?.imgId ?? '', hx: 0, hy: 0, ...entry, ...p } } });
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{
          width: 36, height: 36, borderRadius: 9, border: '1.5px dashed var(--line)',
          display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" style={{ maxWidth: 32, maxHeight: 32 }} /> : <span style={{ color: 'var(--faint)', fontSize: 14 }}>✛</span>}
        </span>
        <div><b>{CURSOR_STATE_LABEL[state].label}</b><small>{CURSOR_STATE_LABEL[state].desc}</small></div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input id={inputId} type="file" accept="image/png,image/gif,image/webp,image/x-icon,.cur,.ani" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const { blob, resized } = await fitCursorImage(f);
            setEntry({ imgId: await putBlob(blob) });
            if (resized) toast('图片尺寸过大，已缩小至 128px 以内以用作光标');
          }} />
        <button className="btn btn-ghost" style={{ height: 33, padding: '0 12px', fontSize: 11 }}
          onClick={() => document.getElementById(inputId)?.click()}>{entry ? '更换' : '上传'}</button>
        {entry && (
          <>
            <span className="cp-lb">핫스팟 X</span>
            <KStep value={entry.hx} min={0} max={32} step={1} onChange={v => setEntry({ hx: v })} />
            <span className="cp-lb">Y</span>
            <KStep value={entry.hy} min={0} max={32} step={1} onChange={v => setEntry({ hy: v })} />
            <button className="btn btn-ghost" style={{ height: 33, padding: '0 12px', fontSize: 11 }}
              onClick={() => {
                const next = { ...st.states };
                delete next[state];
                patch({ states: next });
              }}>移除</button>
          </>
        )}
      </div>
    </div>
  );
}

function CursorPane() {
  const [st, patch] = useCursorSettings();
  return (
    <div className="set-sec">
      <h3>鼠标光标</h3>
      <div className="d">为不同状态设置光标（png、gif、cur、ani，建议约 32px）及点击热点。ani 会播放动画；cur/ani 使用文件内置热点；未设置的状态使用默认光标。</div>
      <p className="hint" style={{ margin: '-6px 0 10px' }}>
        浏览器无法使用超过 128px 的图片作为光标；上传较大图片时会自动缩小。
      </p>
      <div className="set-row">
        <div className="l"><b>启用自定义光标</b><small>关闭后全部恢复默认光标（已上传图片会保留）</small></div>
        <KToggle checked={st.enabled} onChange={v => patch({ enabled: v })} />
      </div>
      {(Object.keys(CURSOR_STATE_LABEL) as CursorState[]).map(s => <CursorRow key={s} state={s} />)}
    </div>
  );
}

/** 데이터 백업 탭 (5.2) — 백업(데이터만/회원까지) · 복원 · 선택 초기화 (v1.9 사용자 확정) */
function DataPane() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [resetOpen, setResetOpen] = useState(false);   // 초기화 항목 선택 모달 (v1.9)
  const [resetAsk, setResetAsk] = useState(false);     // 최종 확인
  const [picked, setPicked] = useState<string[]>([]);  // 선택한 초기화 그룹
  const [pushing, setPushing] = useState(false);       // 설정 서버 업로드 중 (v2.0)
  const serverOn = isServerMode();
  // 서버에 아직 없는 로컬 설정 — 로컬로 먼저 꾸민 뒤 서버를 붙인 경우에만 생긴다.
  // 보통의 설치(연결 먼저)에서는 설정이 바뀔 때마다 서버로 나가므로 이 줄 자체가 뜨지 않는다.
  const [unsynced, setUnsynced] = useState<string[]>([]);
  useEffect(() => { setUnsynced(unsyncedSettingKeys()); }, []);

  // 사용하지 않는 이미지 정리 (v2.0) — 글을 지워도 저장소에는 파일이 남는다.
  // 같은 이미지를 다른 글이 쓰고 있을 수 있어 자동 삭제는 위험하므로, 훑어서 보여 주고 관리자가 지운다.
  const [orphans, setOrphans] = useState<{ ref: string; size: number }[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleanAsk, setCleanAsk] = useState(false);
  const orphanMB = (orphans ?? []).reduce((s, f) => s + f.size, 0) / 1048576;

  const scanOrphans = async () => {
    const be = backend();
    if (!be) { toast('尚未连接服务器'); return; }
    setScanning(true);
    try {
      const rows = await findOrphanFiles(be);
      setOrphans(rows);
      toast(rows.length ? `找到 ${rows.length} 个未使用的图片文件` : '没有可清理的图片');
    } catch (e) {
      // 멈춘 이유를 그대로 보여 준다 (v2.0) — 「권한 문제」로 뭉뚱그리면 진짜 원인을 놓친다
      toast(e instanceof Error && e.message
        ? e.message
        : '无法读取图片列表，请检查存储权限（规则）');
    }
    setScanning(false);
  };

  const cleanOrphans = async () => {
    const be = backend();
    if (!be || !orphans) return;
    setScanning(true);
    let n = 0;
    for (const f of orphans) {
      try { await be.deleteFile(f.ref); n += 1; } catch { /* 개별 실패는 건너뜀 */ }
    }
    setOrphans(null);
    setScanning(false);
    toast(`已删除 ${n} 个图片文件`);
  };

  /* 어디에도 안 걸린 상대 캐릭터 정리 (v2.0 사용자 요청).
     자관을 지워도 그 자관에서 만든 상대 캐릭터는 남는다. **일부러 그렇게 둔다** — 실수로 자관을
     지웠을 때 캐릭터까지 사라지면 되돌릴 방법이 없기 때문(사용자 판단). 대신 정말 아무 자관에도
     안 걸린 것만 골라 여기서 지운다. 내 캐릭터(own)는 자관과 무관하게 존재하므로 건드리지 않는다. */
  const [chars, setChars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [charAsk, setCharAsk] = useState(false);
  const orphanChars = useMemo(() => {
    const used = new Set<string>();
    rels.forEach(r => r.members.forEach(m => used.add(m.charId)));
    return chars.filter(c => !c.own && !used.has(c.id));
  }, [chars, rels]);

  const cleanChars = () => {
    const gone = new Set(orphanChars.map(c => c.id));
    setChars(chars.filter(c => !gone.has(c.id)));
    toast(`已删除 ${gone.size} 个对方角色`);
  };

  // 이 브라우저에 저장돼 있던 사이트 설정을 서버로 올린다 (연결 직후 1회면 충분)
  const doPush = async () => {
    setPushing(true);
    try {
      // 콘텐츠 키(글 목록 등)가 설정 테이블로 들어가지 않게 설정 키 목록만 올린다
      const n = await pushLocalSettings(SETTING_KEYS);
      toast(n > 0 ? `已将 ${n} 项设置上传至服务器，访客也会看到相同效果` : '没有待上传的设置');
      setUnsynced(unsyncedSettingKeys());
    } catch {
      toast('设置上传失败，请确认当前登录的是管理员账号');
    }
    setPushing(false);
  };
  const toggle = (k: string, v: boolean) => setPicked(p => (v ? [...new Set([...p, k])] : p.filter(x => x !== k)));

  /* ---------- 데이터베이스 이전 (v2.0) — 다른 프로젝트/다른 서비스로 통째 옮기기 ---------- */
  const [migOpen, setMigOpen] = useState(false);
  const [migKind, setMigKind] = useState<BackendKind>('supabase');
  const [migSb, setMigSb] = useState({ url: '', anonKey: '' });
  const [migFb, setMigFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '' });
  const [migState, setMigState] = useState<'idle' | 'checking' | 'ready' | 'running' | 'done'>('idle');
  const [migMsg, setMigMsg] = useState('');

  const migCfg = (): BackendConfig => (migKind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: migFb.apiKey.trim(),
        authDomain: migFb.authDomain.trim() || `${migFb.projectId.trim()}.firebaseapp.com`,
        projectId: migFb.projectId.trim(),
        storageBucket: migFb.storageBucket.trim() || `${migFb.projectId.trim()}.appspot.com`,
        appId: migFb.appId.trim(),
      }
    : { kind: 'supabase', url: migSb.url.trim(), anonKey: migSb.anonKey.trim() });

  const migCheck = async () => {
    const bad = validateConfig(migCfg());
    if (bad) { setMigMsg(bad); setMigState('idle'); return; }
    setMigState('checking'); setMigMsg('');
    try {
      const be = await createBackend(migCfg());
      const r = await be.check();
      setMigMsg(r.message);
      setMigState(r.ok ? 'ready' : 'idle');
    } catch (e) {
      setMigMsg(`连接失败：${(e as { message?: string })?.message ?? ''}`);
      setMigState('idle');
    }
  };

  const migRun = async () => {
    setMigState('running');
    try {
      const target = await createBackend(migCfg());
      const r = await migrateTo(target, (m, done, total) => {
        setMigMsg(total ? `${m} (${done}/${total})` : m);
      });
      setMigMsg(`迁移完成：${r.items} 项数据、${r.files} 个图片文件。将下方配置文件上传到仓库后，访客也会使用新数据库。`);
      setMigState('done');
    } catch (e) {
      setMigMsg(`迁移失败：${(e as { message?: string })?.message ?? ''}`);
      setMigState('ready');
    }
  };

  const migDownloadConfig = () => {
    const blob = new Blob([configFileText(migCfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const migSwitch = () => {
    saveLocalConfig(migCfg());
    toast('正在切换到新数据库，即将刷新页面');
    setTimeout(() => window.location.reload(), 700);
  };

  const doExport = async (includeMembers: boolean) => {
    setBusy(true);
    try {
      const { blob, dataCount, blobCount } = await exportBackup(includeMembers);
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `ohome-backup${includeMembers ? '-with-members' : ''}-${todayYmd()}.zip`;
      a.click();
      URL.revokeObjectURL(u);
      toast(`备份完成：${dataCount} 项数据、${blobCount} 个图片文件${includeMembers ? '，含成员数据' : ''}`);
    } catch {
      toast('创建备份失败');
    }
    setBusy(false);
  };

  const doImport = async () => {
    if (!importFile) return;
    setBusy(true);
    try {
      await importBackup(importFile);
      toast('恢复完成，即将刷新页面');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast('恢复失败，请检查文件');
      setBusy(false);
    }
  };

  return (
    <div className="set-sec">
      <h3>数据备份</h3>
      <div className="d">将帖子、角色、角色关系、角色互动等全部数据（JSON）及图片打包为一个 ZIP 文件，便于迁移到其他浏览器或电脑</div>

      {/* 로컬로 먼저 꾸민 뒤 서버를 붙인 경우에만 — 서버에 없는 설정이 남아 있을 때만 나타난다 (v2.0) */}
      {serverOn && unsynced.length > 0 && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>有 {unsynced.length} 项设置尚未上传到服务器</b><small>这些设置是在连接服务器前于此浏览器中创建的；上传后访客才能看到相同效果</small></div>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: pushing ? 0.5 : 1 }}
            disabled={pushing} onClick={doPush}>{pushing ? '正在上传…' : '↑ 上传设置'}</button>
        </div>
      )}
      {/* 쓰지 않는 이미지 정리 (v2.0) — 글을 지워도 저장소 파일은 남는다 */}
      {serverOn && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>清理未使用的图片</b>
            <small>删除内容后图片仍会保留在存储空间中；这里只会清理未被任何内容引用的文件</small></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {orphans && (
              <span className="hint">
                {orphans.length > 0 ? `${orphans.length} 个 · ${orphanMB.toFixed(1)}MB` : '无需清理'}
              </span>
            )}
            <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
              disabled={scanning} onClick={scanOrphans}>{scanning ? '正在检查…' : '查找文件'}</button>
            {orphans && orphans.length > 0 && (
              <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
                disabled={scanning} onClick={() => setCleanAsk(true)}>删除 {orphans.length} 个</button>
            )}
          </div>
        </div>
      )}
      {/* 어디에도 안 걸린 상대 캐릭터 정리 (v2.0 사용자 요청) — 자관을 지워도 캐릭터는 일부러 남긴다.
          실수로 지웠을 때 되돌릴 수 있게. 정말 안 쓰는 것만 여기서 골라 지운다 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>清理未关联的对方角色</b>
          <small>删除角色关系后，对方角色仍会保留以便误删时恢复；这里只会清理未关联到任何角色关系的角色</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="hint">
            {orphanChars.length > 0 ? `${orphanChars.length} 个` : '无需清理'}
          </span>
          {orphanChars.length > 0 && (
            <button className="btn btn-accent" style={{ padding: '9px 18px' }}
              onClick={() => setCharAsk(true)}>删除 {orphanChars.length} 个</button>
          )}
        </div>
      </div>

      {/* 백업 두 갈래 (v1.9 사용자 확정) — 회원 계정 포함 여부 선택 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>导出备份</b><small>帖子、角色、设置及图片打包为 ZIP；可选择是否包含成员账号（成员和邀请码）</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(false)}>↓ 仅数据</button>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(true)}>↓ 含成员数据</button>
        </div>
      </div>
      {/* Firebase Storage는 다른 주소에서 파일을 읽는 것을 기본적으로 막는다 —
          홈에서 보는 데는 지장이 없지만 백업·이전은 파일을 직접 받아와야 해서 한 번 열어 줘야 한다 */}
      {serverOn && backend()?.kind === 'firebase' && (
        <p className="hint" style={{ margin: '10px 0 16px' }}>
          Firebase 需要先<b>配置存储 CORS</b>，备份 ZIP 才能包含图片；否则只会备份帖子和设置。
          安装指南的“备份”部分提供了可在浏览器中完成的操作方法。
        </p>
      )}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>导入备份（恢复）</b><small>当前数据将被备份内容覆盖；恢复后页面会自动刷新</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input id="bkImport" type="file" accept=".zip" style={{ display: 'none' }}
            onChange={e => { setImportFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => document.getElementById('bkImport')?.click()}>
            {importFile ? importFile.name : '选择文件'}
          </button>
          {importFile && (
            <button className="btn btn-dark" style={{ padding: '0 18px', fontSize: 11, opacity: busy ? 0.5 : 1 }}
              disabled={busy} onClick={doImport}>恢复</button>
          )}
        </div>
      </div>

      {/* 데이터베이스 이전 (v2.0) — 새 프로젝트·다른 서비스로 통째 옮기기 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>迁移数据库</b><small>将帖子、设置和图片整体迁移到其他项目或服务（Supabase ↔ Firebase）</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px' }}
          onClick={() => { setMigOpen(true); setMigState('idle'); setMigMsg(''); }}>开始迁移</button>
      </div>

      <Modal open={migOpen} onClose={() => setMigOpen(false)} title="迁移数据库"
        desc="填写目标数据库的连接信息并验证后即可开始；当前数据会保留，并复制到目标位置"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMigOpen(false)}>关闭</button>
          {migState === 'ready' && <button className="btn btn-accent" onClick={migRun}>开始迁移</button>}
          {migState === 'done' && <button className="btn btn-accent" onClick={migSwitch}>切换到新数据库</button>}
        </>}>
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          <button className={migKind === 'supabase' ? 'on' : ''} onClick={() => setMigKind('supabase')}>Supabase</button>
          <button className={migKind === 'firebase' ? 'on' : ''} onClick={() => setMigKind('firebase')}>Firebase</button>
        </div>

        {migKind === 'supabase' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">Project URL</label>
            <KInput value={migSb.url} onChange={e => setMigSb(s => ({ ...s, url: e.target.value }))} placeholder="https://xxxx.supabase.co" />
            <label className="k-label">anon public key</label>
            <KInput value={migSb.anonKey} onChange={e => setMigSb(s => ({ ...s, anonKey: e.target.value }))} />
            <p className="hint" style={{ margin: 0 }}>如果是新项目，请先执行数据库架构 SQL，内容与安装页面相同。</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">粘贴配置（firebaseConfig）</label>
            <KTextarea style={{ minHeight: 84, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }}
              onChange={e => {
                const v = parseFirebaseSnippet(e.target.value);
                if (v) setMigFb(f => ({
                  apiKey: v.apiKey ?? f.apiKey, authDomain: v.authDomain ?? f.authDomain,
                  projectId: v.projectId ?? f.projectId, storageBucket: v.storageBucket ?? f.storageBucket,
                  appId: v.appId ?? f.appId,
                }));
              }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label className="k-label">apiKey</label><KInput value={migFb.apiKey} onChange={e => setMigFb(f => ({ ...f, apiKey: e.target.value }))} /></div>
              <div><label className="k-label">projectId</label><KInput value={migFb.projectId} onChange={e => setMigFb(f => ({ ...f, projectId: e.target.value }))} /></div>
            </div>
            <div><label className="k-label">appId</label><KInput value={migFb.appId} onChange={e => setMigFb(f => ({ ...f, appId: e.target.value }))} /></div>
            <p className="hint" style={{ margin: 0 }}>如果是新项目，请先配置 Firestore 和 Storage 安全规则。</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11 }}
            disabled={migState === 'checking' || migState === 'running'} onClick={migCheck}>
            {migState === 'checking' ? '正在检查…' : '检查连接'}
          </button>
          {migState === 'done' && (
            <button className="btn btn-ghost" style={{ height: 33, padding: '0 14px', fontSize: 11 }}
              onClick={migDownloadConfig}>下载 ohome.config.json</button>
          )}
        </div>
        {migMsg && (
          <p className={migState === 'done' || migState === 'ready' ? 'setup-ok' : 'setup-err'} style={{ marginTop: 10 }}>
            {migMsg}
          </p>
        )}
      </Modal>

      {/* 선택 초기화 (v1.9 사용자 확정) — 메뉴별 체크 + 사이트 설정·이미지·회원 계정 별도 선택 */}
      <div className="set-row">
        <div className="l"><b>重置数据</b><small>选择要删除的内容：各菜单数据、站点设置、图片或成员账号（无法恢复，请先导出备份）</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px', color: 'var(--accent)' }}
          onClick={() => { setPicked([]); setResetOpen(true); }}>重置</button>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="选择要重置的内容"
        desc="仅删除勾选的项目；不勾选成员账号时，注册成员和管理员账号都会保留"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setResetOpen(false)}>取消</button>
          <button className="btn btn-accent" disabled={picked.length === 0}
            style={{ opacity: picked.length === 0 ? 0.45 : 1 }}
            onClick={() => { setResetOpen(false); setResetAsk(true); }}>重置所选项目</button>
        </>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked(RESET_CONTENT.map(g => g.key))}>选择全部菜单数据</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked([...RESET_CONTENT, ...RESET_EXTRA].map(g => g.key))}>全选</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, marginLeft: 'auto' }}
            onClick={() => setPicked([])}>全不选</button>
        </div>
        <label className="k-label">各菜单数据</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '6px 0 4px' }}>
          {RESET_CONTENT.map(g => (
            <KCheck key={g.key} label={g.label} checked={picked.includes(g.key)}
              onChange={v => toggle(g.key, v)} />
          ))}
        </div>
        <div style={{ height: 1, background: 'var(--line)', margin: '14px 0 12px' }} />
        <div style={{ display: 'grid', gap: 9 }}>
          {RESET_EXTRA.map(g => (
            <KCheck key={g.key} checked={picked.includes(g.key)} onChange={v => toggle(g.key, v)}
              label={<span>
                <b style={{ fontSize: 12.5 }}>{g.label}</b>{' '}
                <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.desc}</small>
              </span>} />
          ))}
        </div>
      </Modal>

      <ConfirmModal open={cleanAsk} title={`要删除 ${orphans?.length ?? 0} 个未使用的图片吗？`}
        body={`将释放存储空间 ${orphanMB.toFixed(1)}MB。这里只选择了当前帖子、角色和设置均未引用的文件，但删除后无法恢复。如有顾虑，请先备份。`}
        onClose={() => setCleanAsk(false)}
        buttons={[
          { label: '删除', kind: 'accent', onClick: () => { setCleanAsk(false); void cleanOrphans(); } },
          { label: '取消', kind: 'ghost', onClick: () => setCleanAsk(false) },
        ]} />

      {/* 지울 캐릭터 이름을 그대로 보여 준다 (v2.0) — 개수만으로는 무엇이 사라지는지 알 수 없다 */}
      <ConfirmModal open={charAsk} title={`要删除 ${orphanChars.length} 个对方角色吗？`}
        body={`${orphanChars.slice(0, 12).map(c => c.name).join(', ')}${orphanChars.length > 12 ? ` 等 ${orphanChars.length - 12} 个` : ''}。这些角色未关联到任何角色关系，删除后无法恢复。`}
        onClose={() => setCharAsk(false)}
        buttons={[
          { label: '删除', kind: 'accent', onClick: () => { setCharAsk(false); cleanChars(); } },
          { label: '取消', kind: 'ghost', onClick: () => setCharAsk(false) },
        ]} />

      <ConfirmModal open={resetAsk} title="要重置所选项目吗？"
        body={`将删除：${[...RESET_CONTENT, ...RESET_EXTRA].filter(g => picked.includes(g.key)).map(g => g.label).join(' · ')}\n删除的内容无法恢复。`}
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: '重置', kind: 'accent', onClick: () => {
            // 서버 모드에서는 DB에서도 지우므로 끝난 뒤에 새로고침 (v2.0)
            setResetAsk(false);
            toast('正在重置…');
            void resetGroups(picked)
              .then(r => {
                // 실패를 숨기면 "지웠다"고 나오는데 서버에는 그대로 남는다 — 건수를 그대로 알린다
                if (r.failed.length) {
                  toast(`有 ${r.failed.length} 项无法从服务器删除，请检查登录状态和安全规则`);
                } else if (serverOn) {
                  const part = [`${r.rows} 项内容`];
                  if (r.files) part.push(`${r.files} 个图片文件`);
                  if (r.members) part.push(`${r.members} 个成员`);
                  toast(`已从服务器删除 ${part.join(' · ')}${r.members ? '（请在控制台删除登录账号）' : ''}`);
                } else {
                  toast('所选项目已重置，即将刷新页面');
                }
              })
              .catch(() => { toast('重置失败，请检查登录状态'); })
              .finally(() => setTimeout(() => window.location.reload(), 1400));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
    </div>
  );
}

/** 멤버 선택 모달 (v2.0 사용자 요청) — 「비로그인 숨김」 메뉴를 특정 회원에게만.
 *  검색으로 걸러 체크하고, 비우면 지금까지처럼 로그인한 모든 회원. 관리자는 항상 볼 수 있어 목록에 없다 */
function MemberPickModal({ initial, onApply, onClose, desc }: {
  initial: string[]; onApply: (ids: string[]) => void; onClose: () => void;
  desc?: string;   // 무엇에 대한 선택인지 — 노출 제한/글쓰기 권한이 같은 모달을 쓴다 (v2.0)
}) {
  const pool = useMembers().filter(p => p.id !== 'admin' && p.role !== 'admin');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(initial);
  const t = q.trim().toLowerCase();
  const list = pool.filter(p => !t || p.nickname.toLowerCase().includes(t) || p.id.toLowerCase().includes(t));
  return (
    <Modal open small title="选择成员" onClose={onClose}
      desc={desc ?? '仅所选成员和管理员可以看到并访问此菜单；不选择时对所有已登录成员开放'}
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-accent" onClick={() => { onApply(sel); onClose(); }}>적용</button>
      </>}>
      <div style={{ display: 'grid', gap: 9 }}>
        <KInput placeholder="搜索昵称或账号" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: 4, alignContent: 'start' }}>
          {list.map(p => (
            <KCheck key={p.id}
              label={<span style={{ fontSize: 12.5 }}>{p.nickname} <small style={{ color: 'var(--faint)' }}>{p.id}</small></span>}
              checked={sel.includes(p.id)}
              onChange={v => setSel(s => (v ? [...s, p.id] : s.filter(x => x !== p.id)))} />
          ))}
          {list.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              {pool.length === 0 ? '暂无已注册成员' : '没有符合条件的成员'}
            </p>
          )}
        </div>
        {/* 탈퇴 등으로 목록에 없는 선택이 남아 있으면 알려 준다 — 몰래 남아 계속 잠그는 일이 없게 */}
        {sel.some(id => !pool.some(p => p.id === id)) && (
          <p className="hint" style={{ margin: 0 }}>
            有 {sel.filter(id => !pool.some(p => p.id === id)).length} 个所选成员不在列表中；应用后仍会保留
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 메뉴 관리 탭 (5.2 — 메뉴 선택제) — 노출·순서·이름 + 메뉴별 부속 설정 */
function MenuPane() {
  const [ms, patch, msLoaded] = useMenuSettings();
  // 글에도 적용 (v2.0 사용자 요청) — 아래 applyVis 참조
  const { user } = useAuth();
  const [visBusy, setVisBusy] = useState(false);
  // 「주소로는 열람 허용」을 켤 때 띄우는 확인 (v2.0 사용자 요청)
  const [openAsk, setOpenAsk] = useState<(() => void) | null>(null);
  const [visAsk, setVisAsk] = useState(false);
  // 멤버 선택 모달 (v2.0 사용자 요청) — 「비로그인 숨김」·갤러리 글쓰기를 특정 회원으로 좁힌다
  const [memAsk, setMemAsk] = useState<{ ids: string[]; apply: (ids: string[]) => void; desc?: string } | null>(null);
  const [commSet, patchComm] = useCommSettings();
  const { boards, loaded: bLoaded, patchBoard } = useBoards();  // 추가 게시판 이름·자동 편입 동기화 + 권한
  const toast = useToast();
  const del = useConfirmDelete();
  const saved = ms.tree ?? defaultTree();
  // 게시판 + 여러 개로 만든 섹션 — 메뉴가 아는 「추가 항목」 전체 (v2.0)
  const { map: secMap } = useSections();
  const { links, setLinks } = useCustomLinks();   // 커스텀 링크 (v2.0 사용자 요청)
  // 자관마다 메뉴 항목 (커플홈 사용자 요청) — 지운 자관의 항목은 정규화에서 빠진다
  const [rels, , relsLoaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  // 새 커스텀 링크 입력 폼 (v2.0 사용자 제보 — 「주소를 적으면 이름 짓기 전에 올라간다」).
  // 예전에는 ADD가 빈 행을 즉시 등록해, 주소를 치는 순간 미배치에 미완성 링크가 나타났다
  const [nlName, setNlName] = useState('');
  const [nlHref, setNlHref] = useState('');
  const extraAll = [...boardEntries(boards), ...sectionMenuEntries(secMap), ...relMenuEntries(rels), ...linkEntries(links)];
  const defLabel = (href: string) => menuLabelFor(href, extraAll) ?? href;

  // 드래프트 — 모든 편집(삭제 포함)은 SAVE를 눌러야 실제 메뉴에 반영 (v1.9 사용자 피드백)
  const [draft, setDraft] = useState<MenuGroupNode[] | null>(null);
  const [draftRemoved, setDraftRemoved] = useState<string[] | null>(null);
  const tree = draft ?? saved;
  const removed = draftRemoved ?? ms.removedBoards;
  const dirty = draft !== null && (
    JSON.stringify(draft) !== JSON.stringify(saved)
    || JSON.stringify(removed) !== JSON.stringify(ms.removedBoards));
  // 저장본이 바뀌면(정규화·다른 탭) 편집 전 상태에서만 드래프트 갱신
  const savedKey = JSON.stringify([saved, ms.removedBoards]);
  useEffect(() => {
    if (!msLoaded || !bLoaded) return;
    if (!dirty) { setDraft(saved); setDraftRemoved(ms.removedBoards); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, msLoaded, bLoaded]);

  const setTree = (t: MenuGroupNode[]) => setDraft(t);
  const saveAll = () => { patch({ tree, removedBoards: removed }); toast('菜单已保存'); };

  /* 이미 올라간 글의 공개범위를 서버에 적용 (v2.0 사용자 요청).
     화면에서 가리는 것만으로는 API를 직접 부르는 사람에게 그대로 보인다 — 서버(RLS)가
     내주지 않게 하려면 행의 공개범위 칸 자체가 좁아야 한다.
     컬렉션을 하나씩 훑어 **비공개 메뉴에 걸린 것만** 골라 그 칸만 갱신한다(내용·순서는 그대로).
     새 글은 저장할 때마다 같은 기준이 자동으로 걸리므로(visFloor) 이 버튼은 **이미 있는 글**용이다. */
  const applyVis = async () => {
    const be = backend();
    if (!be) { toast('尚未连接服务器；浏览器本地存储模式不具备服务器权限'); return; }
    setVisBusy(true);
    try {
      let n = 0;
      for (const coll of CONTENT_COLLECTIONS) {
        const rows = await be.fetchList(coll);
        const targets = rows.filter(r => visFloorOf(coll, r) !== 'public');
        if (targets.length) n += await be.refreshVis(coll, targets, user?.id ?? null);
      }
      toast(n ? `已在服务器上隐藏 ${n} 项内容` : '私密菜单中没有内容');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : '应用失败');
    }
    setVisBusy(false);
  };
  const revert = () => { setDraft(saved); setDraftRemoved(ms.removedBoards); };

  // 이탈 경고 — 미저장 변경이 있는데 상단바·다른 설정 탭으로 이동하려 하면 (테마와 동일 패턴)
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const [leaveAsk, setLeaveAsk] = useState(false);
  const pendingClick = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onCapture = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const t = e.target as HTMLElement | null;
      const hit = t?.closest?.('.topbar a, .topbar button, .topbar .brand, .set-nav button') as HTMLElement | null;
      if (!hit) return;
      e.preventDefault(); e.stopPropagation();
      pendingClick.current = hit; setLeaveAsk(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, []);
  const [resetAsk, setResetAsk] = useState(false);   // 기본 구성 리셋 확인 모달
  const [mtab, setMtab] = useState<'basic' | 'perm'>('basic');   // 기본(구성) / 권한 탭 (v1.9)
  // 역극 비로그인 안내 문구 (v1.9 — pagetext 'rp-gate-desc')
  const [rpGate, setRpGate] = useState('');
  useEffect(() => { setRpGate(getPageText('rp-gate-desc', '角色互动内容仅对已登录的参与者显示')); }, []);
  const leaveWith = (action: 'save' | 'discard') => {
    if (action === 'save') patch({ tree, removedBoards: removed });
    else revert();
    dirtyRef.current = false;
    setLeaveAsk(false);
    const el = pendingClick.current;
    pendingClick.current = null;
    setTimeout(() => el?.click(), 30);   // 보류했던 클릭 재실행 → 원래 목적지로
  };

  /* 트리 정규화(저장본 대상) — 사라진 기능(삭제된 게시판) 제거.
     **새로 만든 것을 자동으로 넣지는 않는다** (v2.0 사용자 확정) — 미배치에 머물게 둔다 */
  useEffect(() => {
    if (!msLoaded || !bLoaded || !relsLoaded) return;   // 자관 목록이 오기 전에 자관 항목을 「사라진 기능」으로 지우면 안 된다
    let next: MenuGroupNode[] = saved
      .map(g => (g.href
        ? (menuLabelFor(g.href, extraAll) === null ? null : g)
        : { ...g, items: g.items.filter(it => menuLabelFor(it.href, extraAll) !== null) }))
      .filter((g): g is MenuGroupNode => !!g);
    if (JSON.stringify(next) !== JSON.stringify(saved)) patch({ tree: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msLoaded, bLoaded, relsLoaded, boards, rels, ms.tree]);

  // 미배치 = 트리에 없는 기능 — 메뉴에 노출되지 않음 (데이터는 보존)
  const placedSet = new Set(tree.flatMap(g => (g.href ? [g.href] : g.items.map(i => i.href))));
  const unplaced = [
    ...FEATURES.filter(f => !placedSet.has(f.href)),
    // 게시판·갤러리·다이어리 등 여러 개로 만든 것도 여기 뜬다 (v2.0 사용자 요청).
    // 자동 배치를 없앴으므로 **만들면 여기 머문다** — 원하는 상위 메뉴에 직접 넣는다
    ...extraAll.map(b => ({ href: b.href, label: b.name })).filter(x => !placedSet.has(x.href)),
  ];

  const patchGroup = (id: string, p: Partial<MenuGroupNode>) =>
    setTree(tree.map(g => (g.id === id ? { ...g, ...p } : g)));
  // 배치 해제 시 게시판이면 자동 편입 제외 목록에 (다시 배치하면 해제) — 드래프트에만
  const markRemoved = (hrefs: string[]) => {
    // 추가 항목(게시판·섹션)은 빼 두면 자동 배치가 다시 넣지 않도록 기억한다 —
    // 기억하지 않으면 빼는 순간 자동 배치가 원래 자리로 되돌려 놓는다
    const known = new Set(extraAll.map(b => b.href));
    const bs = hrefs.filter(h => known.has(h));
    if (bs.length) setDraftRemoved([...new Set([...removed, ...bs])]);
  };
  const removeGroup = (g: MenuGroupNode) => {
    setTree(tree.filter(x => x.id !== g.id));
    markRemoved(g.href ? [g.href] : g.items.map(i => i.href));
  };
  // 삭제는 경고 모달을 거친 뒤 드래프트에 반영 — SAVE를 눌러야 실제 메뉴에서 사라짐
  const askRemoveGroup = (g: MenuGroupNode) => del.ask(
    g.href ? `要从菜单中移除单独菜单“${g.label}”吗？` : `要删除上级菜单“${g.label}”吗？`,
    () => removeGroup(g),
    `${g.href ? '此功能' : '子菜单'}将移至“未放置”列表，数据会保留。点击“保存”后才会应用到实际菜单。`);
  const removeItem = (gid: string, href: string) => {
    setTree(tree.map(g => (g.id === gid ? { ...g, items: g.items.filter(i => i.href !== href) } : g)));
    markRemoved([href]);
  };
  const moveItem = (fromGid: string, it: MenuLeaf, to: string) => {
    const stripped = tree.map(g => (g.id === fromGid ? { ...g, items: g.items.filter(i => i.href !== it.href) } : g));
    if (to === 'solo') {
      setTree([...stripped, { id: newGroupId(), label: it.label ?? defLabel(it.href), href: it.href, items: [], pageTitle: it.pageTitle }]);
    } else {
      setTree(stripped.map(g => (g.id === to ? { ...g, items: [...g.items, it] } : g)));
    }
  };
  const placeUnplaced = (href: string, to: string) => {
    if (to === 'solo') setTree([...tree, { id: newGroupId(), label: defLabel(href), href, items: [] }]);
    else setTree(tree.map(g => (g.id === to ? { ...g, items: [...g.items, { href }] } : g)));
    if (href.startsWith('/board?b=')) setDraftRemoved(removed.filter(h => h !== href));
  };
  const groupOptions = (excludeId?: string) => [
    ...tree.filter(g => !g.href && g.id !== excludeId).map(g => ({ value: g.id, label: `→ ${g.label}` })),
    { value: 'solo', label: '→ 单独菜单' },
  ];

  const permSel = (label: string, value: MenuPerm, onChange: (v: MenuPerm) => void) => (
    <KSelect minWidth={110} value={value} onChange={v => onChange(v as MenuPerm)}
      options={[
        { value: 'guest', label: `${label}：访客` },
        { value: 'member', label: `${label}：成员` },
        { value: 'admin', label: `${label}：管理员` },
      ]} />
  );
  /* 게시판 글쓰기 권한 (커플홈 사용자 요청 — 갤러리에만 있던 「가입자/관리자 + 글쓰기 멤버」를 모든 게시판에).
     값은 게시판마다 다른 곳에 산다 — 리스트는 게시판 설정 permWrite, 로드비 기본 페이지는 roadUpload,
     나머지(Videos·감상타래·캐릭터·도토리·플레이기록·RP LOG·추가 로드비)는 메뉴 설정 writePerm[키] — 멤버 선택은 전부 writeMembers[키] */
  const setWriteMembers = (key: string, n: string[]) => {
    const next = { ...ms.writeMembers };
    if (n.length) next[key] = n; else delete next[key];
    return next;
  };
  /** 「글쓰기 멤버」 버튼 — 가입자 권한일 때만. 체크한 회원(+관리자)만 쓰게 좁힌다 */
  const writeMembersBtn = (key: string, perm: MenuPerm, what: string) => {
    if (perm === 'admin') return null;
    const ids = ms.writeMembers?.[key];
    return (
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
        onClick={() => setMemAsk({
          ids: ids ?? [],
          desc: `仅勾选的成员和管理员可以在此${what}；不选择时对所有已登录成员开放`,
          apply: n => patch({ writeMembers: setWriteMembers(key, n) }),
        })}>
        {ids?.length ? `${what}成员 ${ids.length} 人` : `${what}成员`}
      </button>
    );
  };
  /** 멤버 버튼 + 가입자/관리자 셀렉트. 관리자 전용으로 바꾸면 멤버 선택은 함께 지운다 — 몰래 남아 있지 않게 (갤러리와 같은 규칙) */
  const writePermUI = (key: string, perm: MenuPerm, setPerm: (v: MenuPerm) => void, what: string) => (
    <>
      {writeMembersBtn(key, perm, what)}
      <KSelect minWidth={110} value={perm}
        onChange={v => {
          if (v === 'admin' && ms.writeMembers?.[key]) patch({ writeMembers: setWriteMembers(key, []) });
          setPerm(v as MenuPerm);
        }}
        options={[
          { value: 'member', label: `${what}: 가입자` },
          { value: 'admin', label: `${what}: 관리자` },
        ]} />
    </>
  );
  /** 메뉴 주소 → 글쓰기 권한 저장 키·지금 값·기본값 (writePerm에 사는 게시판만 · 아니면 null) */
  const writePermOf = (href: string): { key: string; perm: MenuPerm; what: string } | null => {
    const [path, query = ''] = href.split('?');
    const sq = new URLSearchParams(query).get('s');
    let secId = MAIN_SEC;
    if (sq) {
      // 메뉴 주소에는 별명(slug)이 적혀 있을 수 있다 — id로 통일해 저장
      const kind = (Object.keys(SECTION_META) as SectionKind[]).find(k => SECTION_META[k].href === path);
      const sec = kind ? sectionsOf(secMap, kind).find(s2 => s2.id === sq || s2.slug === sq) : undefined;
      if (!sec) return null;
      secId = sec.id;
    }
    const def: MenuPerm | null =
      path === '/tchars' || path === '/playlog' ? 'admin'
      : path === '/videos' || path === '/threads' || path === '/dotori' || path === '/log' ? 'member'   // RP LOG — 등록 권한이 있는 회원은 수정도 (trpgPerm.ts)
      // 추가 로드비 — 기본 페이지의 공통값(roadUpload)을 따르되 따로 정할 수 있다 (기본 페이지는 아래 /loadb 가지에서)
      : path === '/loadb' && secId !== MAIN_SEC ? (ms.roadUpload === 'admin' ? 'admin' : 'member')
      : null;
    if (def === null) return null;
    const key = writeKeyOf(path, secId);
    const what = path === '/loadb' ? '업로드' : path === '/tchars' || path === '/playlog' || path === '/dotori' || path === '/log' ? '등록' : '글쓰기';
    return { key, perm: ms.writePerm?.[key] ?? def, what };
  };

  // 메뉴별 부속 설정 — 기본 탭용 (표시 방식 등)
  const extraFor = (href: string) => {
    switch (href) {
      case '/gallery': return (
        <div className="mini-seg">
          <button className={ms.backupView === 'gal' ? 'on' : ''} onClick={() => patch({ backupView: 'gal' })}>默认：图集</button>
          <button className={ms.backupView === 'list' ? 'on' : ''} onClick={() => patch({ backupView: 'list' })}>默认：列表</button>
        </div>
      );
      case '/comm': return (
        <div className="mini-seg">
          <button className={commSet.ratio === '3:4' ? 'on' : ''} onClick={() => patchComm({ ratio: '3:4' })}>비율 3:4</button>
          <button className={commSet.ratio === '4:3' ? 'on' : ''} onClick={() => patchComm({ ratio: '4:3' })}>비율 4:3</button>
        </div>
      );
      // 스케줄러 달 표기 (v1.9) — AUGUST 2026 / 2026.08
      case '/cal': return (
        <div className="mini-seg">
          <button className={(ms.calTitle ?? 'en') === 'en' ? 'on' : ''} onClick={() => patch({ calTitle: 'en' })}>AUGUST 2026</button>
          <button className={ms.calTitle === 'num' ? 'on' : ''} onClick={() => patch({ calTitle: 'num' })}>2026.08</button>
        </div>
      );
      default: return null;
    }
  };

  // 메뉴별 권한 부속 — 권한 탭용 (v1.9)
  const extraPerm = (href: string) => {
    // 역극 — 비로그인 안내 문구 (관리자는 그 화면을 볼 수 없어 여기서 편집)
    if (href === '/rp') {
      return (
        <KInput value={rpGate}
          onChange={e => { setRpGate(e.target.value); setPageText('rp-gate-desc', e.target.value); }}
          placeholder="비로그인 안내 문구" style={{ width: 210, fontSize: 12 }} />
      );
    }
    // 게시판 글쓰기·댓글 권한 (게시판별)
    if (href === '/board' || href.startsWith('/board?b=')) {
      const bid = href === '/board' ? MAIN_BOARD_ID : href.slice('/board?b='.length);
      const bd = boards.find(b => b.id === bid);
      if (!bd) return null;
      return (
        <>
          {/* 글쓰기 — 게시판 설정 permWrite + 「글쓰기 멤버」 (커플홈) */}
          {writePermUI(boardHref(bd.id), bd.permWrite as MenuPerm, v => patchBoard(bd.id, { permWrite: v as BoardPerm }), '글쓰기')}
          <KSelect minWidth={110} value={bd.permComment}
            onChange={v => patchBoard(bd.id, { permComment: v as BoardPerm })}
            options={[
              { value: 'guest', label: '댓글: 방문자' },
              { value: 'member', label: '댓글: 가입자' },
              { value: 'admin', label: '댓글: 관리자' },
            ]} />
        </>
      );
    }
    if (href === '/loadb') {
      return (
        <>
          {writeMembersBtn('/loadb', ms.roadUpload, '업로드')}
          {permSel('업로드', ms.roadUpload, v => patch({ roadUpload: v, ...(v === 'admin' ? { writeMembers: setWriteMembers('/loadb', []) } : {}) }))}
          {permSel('댓글', ms.roadComment, v => patch({ roadComment: v }))}
        </>
      );
    }
    // 갤러리 글쓰기 권한 (v2.0 사용자 요청) — 갤러리(섹션)마다 · 「글쓰기 멤버」로 특정 회원까지
    if (href === '/gallery' || href.startsWith('/gallery?s=')) {
      const key = href === '/gallery' ? MAIN_SEC : href.slice('/gallery?s='.length);
      // 메뉴 주소에는 별명(slug)이 적혀 있을 수 있다 — id로 통일해 저장
      const gsec = sectionsOf(secMap, 'gallery').find(s2 => s2.id === key || s2.slug === key);
      if (!gsec) return null;
      const gw = ms.galWrite?.[gsec.id] ?? 'member';
      const gwIds = ms.galWriteMembers?.[gsec.id];
      return (
        <>
          {gw === 'member' && (
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
              onClick={() => setMemAsk({
                ids: gwIds ?? [],
                desc: '체크한 회원(그리고 관리자)만 이 갤러리에 글을 쓸 수 있습니다 — 비우면 로그인한 모든 회원',
                apply: n => {
                  const next = { ...ms.galWriteMembers };
                  if (n.length) next[gsec.id] = n; else delete next[gsec.id];
                  patch({ galWriteMembers: next });
                },
              })}>
              {gwIds?.length ? `글쓰기 멤버 ${gwIds.length}명` : '글쓰기 멤버'}
            </button>
          )}
          <KSelect minWidth={110} value={gw}
            onChange={v => {
              // 관리자 전용으로 바꾸면 멤버 선택은 함께 지운다 — 몰래 남아 있지 않게 (노출 제한과 같은 규칙)
              const next = { ...ms.galWriteMembers };
              if (v !== 'member') delete next[gsec.id];
              patch({ galWrite: { ...ms.galWrite, [gsec.id]: v as MenuPerm }, galWriteMembers: next });
            }}
            options={[
              { value: 'member', label: '글쓰기: 가입자' },
              { value: 'admin', label: '글쓰기: 관리자' },
            ]} />
        </>
      );
    }
    // 그 밖의 게시판 (Videos·감상타래·캐릭터·도토리·플레이기록·RP LOG·추가 로드비) — 메뉴 설정 writePerm (커플홈 사용자 요청)
    const wp = writePermOf(href);
    if (wp) return writePermUI(wp.key, wp.perm, v => patch({ writePerm: { ...ms.writePerm, [wp.key]: v } }), wp.what);
    return null;
  };

  /* 「주소로는 열람 허용」 (v2.0 사용자 요청) — 메뉴·위젯에서는 감추되 들어오는 것만 열어 준다.
     링크로만 돌릴 게시판을 만들려는 용도라, 켤 때 **주소를 아는 사람은 누구나 본다**는 점을
     모달로 분명히 알린다(사용자 요청). 「전부 보임」에서는 이미 열려 있으므로 뜻이 없어 감춘다 */
  const openChk = (v: MenuVis | undefined, open: boolean | undefined, onChange: (nv: boolean) => void) => (
    (v ?? 'all') === 'all' ? null : (
          <KCheck label={<span style={{ fontSize: 11 }}>允许通过链接访问</span>} checked={!!open}
        onChange={nv => { if (nv) setOpenAsk(() => () => onChange(true)); else onChange(false); }} />
    )
  );

  // 공개범위 셀렉트 (v1.9) — 메뉴 자체 노출: 전부 / 비로그인 숨김 / 관리자만 (드래프트 — SAVE로 적용)
  const visSel = (v: MenuVis | undefined, onChange: (nv: MenuVis) => void) => (
    <KSelect minWidth={128} value={v ?? 'all'} onChange={nv => onChange(nv as MenuVis)}
      options={[
        { value: 'all', label: '所有人可见' },
        { value: 'member', label: '对未登录用户隐藏' },
        { value: 'admin', label: '仅管理员可见' },
      ]} />
  );

  /* 멤버 선택 (v2.0 사용자 요청) — 「비로그인 숨김」일 때만 뜨는 버튼.
     검색 모달에서 고른 회원(+관리자)에게만 보이고 들어갈 수 있다 — 비우면 로그인한 모든 회원 */
  const memberBtn = (v: MenuVis | undefined, ids: string[] | undefined, apply: (ids: string[] | undefined) => void) => (
    v !== 'member' ? null : (
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
        onClick={() => setMemAsk({ ids: ids ?? [], apply: n => apply(n.length ? n : undefined) })}>
        {ids?.length ? `成员 ${ids.length} 人` : '选择成员'}
      </button>
    )
  );
  return (
    <div className="set-sec">
      {/* 제목은 다른 탭과 같은 시작 위치(상단 정렬) — 버튼 줄 높이에 밀려 내려가지 않게 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>菜单管理</h3>
        {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>有未保存的更改</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }}
            onClick={() => setResetAsk(true)}>恢复默认布局</button>
          <button className="btn btn-ghost" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.45, padding: '6px 14px', fontSize: 11 }}
            onClick={() => { revert(); toast('已恢复为已保存的菜单'); }}>取消更改</button>
          <button className="btn btn-dark" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.45, padding: '6px 18px', fontSize: 11 }}
            onClick={saveAll}>SAVE</button>
        </div>
      </div>
      {/* 기본(구성) / 권한 탭 (v1.9) — 권한 설정이 길어져 분리 */}
      <div className="mini-seg" style={{ marginBottom: 14 }}>
        <button className={mtab === 'basic' ? 'on' : ''} onClick={() => setMtab('basic')}>基本设置</button>
        <button className={mtab === 'perm' ? 'on' : ''} onClick={() => setMtab('perm')}>权限</button>
      </div>

      {mtab === 'perm' ? (
        /* ---------- 권한 탭 — 메뉴 공개범위 + 메뉴별 권한 부속 ---------- */
        <div>
          <div className="d">
            可见范围决定菜单是否显示（所有人可见/对未登录用户隐藏/仅管理员可见），点击“保存”后生效；发帖和评论权限即时生效。
            <br />
            可分别设置各内容区（图集、帖子、绘图记录、视频、讨论串、角色、剧本愿望单、游玩记录）的发帖权限为成员或管理员；也可通过<b>发帖成员</b>限制特定成员。
            <br />
            点击“对未登录用户隐藏”旁的<b>选择成员</b>可限制特定成员访问；不选择时对所有已登录成员开放。
            <br />
            启用<b>允许通过链接访问</b>后，菜单仍会隐藏，但<b>知道链接的人都可以访问</b>；适合仅通过链接分享的内容区。
          </div>
          {tree.map(g => (
            <div key={g.id} style={{ borderBottom: '1px dashed var(--line)', padding: '9px 0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{g.label}</b>
                {g.href && <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.href}</small>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {g.href && extraPerm(g.href)}
                  {openChk(g.vis, g.open, nv => patchGroup(g.id, { open: nv || undefined }))}
                  {memberBtn(g.vis, g.visMembers, ids => patchGroup(g.id, { visMembers: ids }))}
                  {visSel(g.vis, nv => patchGroup(g.id, {
                    vis: nv === 'all' ? undefined : nv,
                    ...(nv === 'all' ? { open: undefined } : {}),
                    ...(nv !== 'member' ? { visMembers: undefined } : {}),
                  }))}
                </div>
              </div>
              {!g.href && g.items.map(it => (
                <div key={it.href} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0 0 22px' }}>
                  <span style={{ fontSize: 12.5 }}>{it.label ?? defLabel(it.href)}</span>
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{it.href}</small>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {extraPerm(it.href)}
                    {openChk(it.vis, it.open, nv => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href ? { ...x, open: nv || undefined } : x)),
                    }))}
                    {memberBtn(it.vis, it.visMembers, ids => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href ? { ...x, visMembers: ids } : x)),
                    }))}
                    {visSel(it.vis, nv => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href
                        ? {
                          ...x, vis: nv === 'all' ? undefined : nv,
                          ...(nv === 'all' ? { open: undefined } : {}),
                          ...(nv !== 'member' ? { visMembers: undefined } : {}),
                        } : x)),
                    }))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* 글에도 적용 (v2.0 사용자 요청) — 공개범위를 서버까지 적용한다 */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <b style={{ fontSize: 13 }}>将内容设为私密</b>
            <div className="d" style={{ marginTop: 4, lineHeight: 1.7 }}>
              上方的可见范围只会<b>在界面中隐藏菜单</b>，通过链接或 API 仍可能访问内容。
              点击此按钮可<b>将已发布内容的可见范围同步到服务器</b>，由服务器阻止未授权访问：
              “对未登录用户隐藏”会设为成员可见，“仅管理员可见”会设为私密。
              <br />
              <b>今后发布的内容会自动按此规则保存。</b>{' '}
              <span style={{ color: 'var(--accent)' }}>此操作只会收紧权限，不会放宽权限</span>；
              如需重新公开，必须逐条修改内容的可见范围。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-dark" disabled={visBusy || dirty}
                onClick={() => setVisAsk(true)}>
                {visBusy ? '正在应用…' : dirty ? '请先保存' : '应用到已有内容'}
              </button>
            </div>
          </div>
          {/* 멤버 선택 (v2.0 사용자 요청) — 검색으로 골라 그 회원(+관리자)에게만 */}
          {memAsk && (
            <MemberPickModal initial={memAsk.ids} onApply={memAsk.apply} desc={memAsk.desc}
              onClose={() => setMemAsk(null)} />
          )}

          {/* 「주소로는 열람 허용」 확인 (v2.0 사용자 요청) — 켜는 순간 무엇이 열리는지 분명히 */}
          <ConfirmModal open={!!openAsk} title="任何知道链接的人都可以访问"
            body={'此菜单仍会隐藏，但知道链接的人无需登录即可访问。收到链接的人也可以将其转发给其他人。请勿用于存放绝不能泄露的内容。'}
            onClose={() => setOpenAsk(null)}
            buttons={[
              { label: 'CANCEL', kind: 'ghost', onClick: () => setOpenAsk(null) },
              { label: '知道了', kind: 'dark', onClick: () => { openAsk?.(); setOpenAsk(null); } },
            ]} />

          <ConfirmModal open={visAsk} title="要将内容可见范围应用到服务器吗？"
            body={'私密菜单中的内容也会在服务器上隐藏。每条内容的可见范围都会改变，如需恢复必须逐条修改。'}
            onClose={() => setVisAsk(false)}
            buttons={[
              { label: 'CANCEL', kind: 'ghost', onClick: () => setVisAsk(false) },
              { label: '应用', kind: 'dark', onClick: () => { setVisAsk(false); void applyVis(); } },
            ]} />

          {/* 이미지 저장 방지 (v1.9) — 영역별 우클릭·드래그 차단, 관리자 제외 · 즉시 반영 */}
          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: 13 }}>防止保存图片</b>
            <div className="d" style={{ marginTop: 4 }}>在勾选的区域中禁止右键保存和拖动导出图片；管理员账号不受限制，立即生效</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {IMG_PROTECT_AREAS.map(a => (
                <KCheck key={a.key} label={a.label}
                  checked={(ms.imgProtect ?? []).includes(a.key)}
                  onChange={v => patch({
                    imgProtect: v
                      ? [...(ms.imgProtect ?? []), a.key]
                      : (ms.imgProtect ?? []).filter(k => k !== a.key),
                  })} />
              ))}
            </div>
          </div>
        </div>
      ) : (
      <>
      <DragList items={tree} keyOf={g => g.id} onReorder={setTree}
        render={g => (
          <div style={{ width: '100%', borderBottom: '1px dashed var(--line)', padding: '10px 0' }}>
            <div className="set-row" style={{ border: 'none', padding: 0 }}>
              <div className="l" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="drag-h">⠿</span>
                <KInput value={g.label} onChange={e => patchGroup(g.id, { label: e.target.value })}
                  style={{ width: 110, fontWeight: 700 }} />
                {g.href ? (
                  <>
                    <span className="cp-lb">页面标题</span>
                    <KInput value={g.pageTitle ?? ''} placeholder="默认"
                      onChange={e => patchGroup(g.id, { pageTitle: e.target.value || undefined })}
                      style={{ width: 120, fontSize: 12 }} />
                    <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>单独菜单 · {g.href}</small>
                  </>
                ) : <span className="pill">上级菜单</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {g.href && extraFor(g.href)}
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => askRemoveGroup(g)}>{g.href ? '移除' : '删除'}</button>
              </div>
            </div>
            {/* 하위 메뉴 — 그룹 안 순서(⠿)·이름·이동·빼기 + 부속 설정 */}
            {!g.href && (
              <div style={{ padding: '8px 0 0 34px' }}>
                <DragList items={g.items} keyOf={it => it.href}
                  onReorder={items => patchGroup(g.id, { items })}
                  render={it => (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%', padding: '3px 0' }}>
                      <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
                      <KInput value={it.label ?? ''} placeholder={defLabel(it.href)}
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, label: e.target.value || undefined } : x)),
                        })}
                        style={{ width: 110, fontSize: 12 }} />
                      <span className="cp-lb">页面标题</span>
                      <KInput value={it.pageTitle ?? ''} placeholder="默认"
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, pageTitle: e.target.value || undefined } : x)),
                        })}
                        style={{ width: 120, fontSize: 12 }} />
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{it.href}</small>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {extraFor(it.href)}
                        <KSelect minWidth={104} value="" placeholder="移动到"
                          onChange={v => moveItem(g.id, it, v)} options={groupOptions(g.id)} />
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                          onClick={() => removeItem(g.id, it.href)}>移除</button>
                      </div>
                    </div>
                  )} />
                {g.items.length === 0 && (
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>没有子菜单时，上级菜单不会显示在顶部；请从下方“未放置功能”中添加</small>
                )}
              </div>
            )}
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setTree([...tree, { id: newGroupId(), label: '新菜单', items: [] }])}>＋ 添加菜单</button>
      </div>

      <h3 style={{ marginTop: 26 }}>未放置功能</h3>
      <div className="d">尚未添加到菜单树的功能不会显示在菜单中，但数据会保留。选择放置位置即可添加。</div>
      {unplaced.map(f => {
        // 커스텀 링크는 미배치에서도 지울 수 있다 (v2.0 사용자 요청 — 「목록 자체에서 지우고 싶다」).
        // 다른 기능(게시판·섹션 등)은 데이터가 있어 여기서 못 지운다 — 각자의 관리 화면에서
        const link = links.find(l => l.href === f.href);
        return (
          <div key={f.href} className="set-row">
            <div className="l" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <b style={{ fontSize: 12.5 }}>{f.label}</b>
              <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{f.href}</small>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value="" placeholder="选择放置位置"
                onChange={v => placeUnplaced(f.href, v)} options={groupOptions()} />
              {link && (
                <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                  onClick={() => del.ask(`确定删除自定义链接“${link.name}”吗？`,
                    () => setLinks(links.filter(x => x.id !== link.id)),
                    '仅删除链接，链接指向的页面会保留。')}>删除</button>
              )}
            </div>
          </div>
        );
      })}
      {unplaced.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>所有功能均已添加到菜单</div>
      )}

      {/* 커스텀 링크 (v2.0 사용자 요청) — 사이트 안의 아무 페이지나 메뉴로.
          만들면 위 미배치 목록에 나타나고, 거기서 원하는 상위 메뉴에 넣는다 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 22 }}>
        <h3 style={{ margin: 0 }}>自定义链接</h3>
      </div>
      <div className="d">
        将原本需要从列表中选择才能访问的页面（如角色关系或角色）直接添加到菜单，只需填写地址。
        <br />
        粘贴<b>本站地址</b>后会转换为站内路径（例如 <code>…/rels/latte</code> → <code>/rels/latte</code>）；
        <b>其他网站的地址</b>会保留原样并在新窗口中打开。
        新建链接会显示在上方的<b>未放置</b>列表中，可在那里添加到所需的上级菜单。
      </div>
      {links.map(l => (
        <div key={l.id} className="set-row">
          <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <KInput value={l.name} placeholder="菜单中显示的名称"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
              style={{ width: 140 }} />
            <KInput value={l.href} placeholder="/rels/latte 或完整网址"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: e.target.value } : x)))}
              onBlur={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: toInternalPath(e.target.value) } : x)))}
              style={{ width: 260 }} />
          </div>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`确定删除自定义链接“${l.name}”吗？`,
              () => {
                setLinks(links.filter(x => x.id !== l.id));
                // 메뉴에 배치돼 있었으면 그 자리도 함께 비운다 — 없는 주소가 남으면 눌러도 아무 일도 안 난다
                setTree(tree.map(g => ({ ...g, items: g.items.filter(i => i.href !== l.href) })).filter(g => g.href !== l.href));
              },
              '如果此链接已添加到菜单，也会一并移除；链接指向的页面会保留。')}>删除</button>
        </div>
      ))}
      {links.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>暂无链接，请在下方填写名称和地址后点击“添加”</div>
      )}
      {/* 새 링크는 폼을 채워 ADD를 눌러야 등록된다 (v2.0 사용자 제보) —
          예전에는 빈 행이 즉시 등록돼, 주소를 치는 순간 이름도 없는 링크가 미배치에 나타났다 */}
      <div className="set-row" style={{ borderTop: '1px dashed var(--line)' }}>
        <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <KInput value={nlName} placeholder="菜单中显示的名称" onChange={e => setNlName(e.target.value)} style={{ width: 140 }} />
          <KInput value={nlHref} placeholder="/rels/latte 或完整网址" onChange={e => setNlHref(e.target.value)} style={{ width: 260 }} />
        </div>
        <button className="btn btn-dark" style={{ padding: '4px 12px', fontSize: 10.5 }}
          onClick={() => {
            if (!nlName.trim()) { toast('请输入菜单中显示的名称'); return; }
            const href = toInternalPath(nlHref);
            if (!href || href === '/') { toast('请输入要跳转的地址'); return; }
            setLinks([...links, { id: newId(), name: nlName.trim(), href }]);
            setNlName(''); setNlHref('');
            toast('链接已创建，请在上方“未放置”列表中添加到菜单');
          }}>＋ 添加</button>
      </div>
      </>
      )}

      {del.element}
      {/* 기본 구성 리셋 확인 (v1.9) — 드래프트만 교체, SAVE로 확정 */}
      <ConfirmModal open={resetAsk} title="要将菜单恢复为默认布局吗？"
        body="编辑界面将恢复为默认菜单（角色互动、内容、TRPG、记录）。点击“保存”后才会应用到实际菜单。"
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: '恢复默认', kind: 'dark', onClick: () => { setDraft(defaultTree()); setDraftRemoved([]); setResetAsk(false); } },
          { label: '取消', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
      {/* 미저장 메뉴 변경 이탈 경고 (v1.9) */}
      <ConfirmModal open={leaveAsk} title="菜单更改尚未保存"
        body="现在离开将丢失正在编辑的菜单更改。"
        onClose={() => { pendingClick.current = null; setLeaveAsk(false); }}
        buttons={[
          { label: '保存并离开', kind: 'dark', onClick: () => leaveWith('save') },
          { label: '不保存并离开', kind: 'ghost', onClick: () => leaveWith('discard') },
          { label: '取消', kind: 'ghost', onClick: () => { pendingClick.current = null; setLeaveAsk(false); } },
        ]} />
    </div>
  );
}

/** TRPG 탭 (4.15, v1.9) — 도토리 상태 카테고리 라벨 + 뱃지 색 + 플레이기록 표시 열 */
function TrpgPane() {
  const [settings, patch] = useTrpgSettings();
  const [ms, patchMenu] = useMenuSettings();   // 플레이기록 표시 열 (4.16 — 저장 위치는 메뉴 설정)
  // 비밀번호 걸린 로그의 안내 문구 (pagetext 'trpg-lock-desc')
  const [lockDesc, setLockDesc] = useState('');
  useEffect(() => { setLockDesc(getPageText('trpg-lock-desc', '请输入密码以查看内容')); }, []);
  const patchStatus = (k: DotoriStatus, p: Partial<(typeof settings.statuses)[DotoriStatus]>) =>
    patch({ statuses: { ...settings.statuses, [k]: { ...settings.statuses[k], ...p } } });
  // 균등 칸 그리드 — 항목 폭이 라벨 길이에 안 흔들려 PC/모바일 두 줄이 세로로 정렬됨 (v1.9)
  const colToggle = (list: string[], k: keyof MenuSettings) => (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${PLAYLOG_COLS.length}, 1fr)`, gap: 6, justifyItems: 'center' }}>
      {PLAYLOG_COLS.map(c => (
        <KCheck key={c.key} label={c.label} checked={list.includes(c.key)}
          onChange={v => patchMenu({ [k]: v ? [...list, c.key] : list.filter(x => x !== c.key) } as Partial<MenuSettings>)} />
      ))}
    </div>
  );
  return (
    <div className="set-sec">
      {/* 비밀번호 걸린 로그의 안내 문구 — 관리자는 그 화면을 볼 수 없어 여기서 편집 (사용자 요청) */}
      <h3>日志访问提示</h3>
      <div className="d">访问设有密码的日志时显示的提示；管理员不会看到该页面，因此在此编辑</div>
      <div className="set-row" style={{ alignItems: 'center' }}>
        <div className="l"><b>密码提示</b><small>留空时显示默认提示</small></div>
        <KInput value={lockDesc}
          onChange={e => { setLockDesc(e.target.value); setPageText('trpg-lock-desc', e.target.value); }}
          placeholder="请输入密码以查看内容" style={{ width: 300 }} />
      </div>

      <h3>剧本状态分类</h3>
      <div className="d">设置标签及徽标颜色（背景/边框/文字）；卡片上仅显示“待定”和“日程已确认”状态</div>
      {DOTORI_STATUS_KEYS.map(k => {
        const st = settings.statuses[k];
        return (
          <div key={k} className="set-row" style={{ alignItems: 'center' }}>
            <div className="l">
              <span className="dt-badge" style={{ ...dotoriBadgeStyle(st), position: 'static' }}>{st.label || '状态'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={st.label} onChange={e => patchStatus(k, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              <span className="cp-lb">배경</span>
              <ColorField value={st.bg} onChange={hex => patchStatus(k, { bg: hex })} />
              <span className="cp-lb">테두리</span>
              <ColorField value={st.border} onChange={hex => patchStatus(k, { border: hex })} />
              <span className="cp-lb">글씨</span>
              <ColorField value={st.fg} onChange={hex => patchStatus(k, { fg: hex })} />
            </div>
          </div>
        );
      })}

      {/* 플레이기록 표시 열 — PC/모바일 각각 (4.16 v1.8 · v1.9에서 TRPG 탭 하단 배치) */}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      <h3>游玩记录显示列</h3>
      <div className="d">分别选择电脑端和移动端要显示的列（默认：电脑端全部 7 列；移动端为日期/剧本/角色/时长）</div>
      {/* 라벨 폭 고정 — PC/모바일 폭 차이로 두 줄 체크박스 시작점이 어긋나던 것 정렬 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l" style={{ width: 64, flexShrink: 0 }}><b>PC</b></div>
        {colToggle(ms.playlogPc, 'playlogPc')}
      </div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l" style={{ width: 64, flexShrink: 0 }}><b>移动端</b></div>
        {colToggle(ms.playlogMobile, 'playlogMobile')}
      </div>
    </div>
  );
}

/** 메모장 탭 (4.6) — 작성 권한 + 작성자 표시 */
function MemoPane() {
  const [settings, patch] = useMemoSettings();
  return (
    <div className="set-sec">
      <h3>便笺板</h3>
      <div className="d">便笺板选项；位置和顺序会保存并对所有人保持一致</div>
      <div className="set-row">
        <div className="l"><b>允许成员发布</b><small>关闭后仅管理员可以添加便笺</small></div>
        <KToggle checked={settings.allowMember} onChange={v => patch({ allowMember: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>显示作者</b><small>在便笺顶部显示作者昵称</small></div>
        <KToggle checked={settings.showAuthor} onChange={v => patch({ showAuthor: v })} />
      </div>
    </div>
  );
}

/** 감상타래 탭 (4.17) — 분류 리스트 관리 + 기본 보기 */
function ThreadPane() {
  const [settings, patch] = useThreadSettings();
  const [works] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  const del = useConfirmDelete();
  /* 분류는 감상타래마다 따로 (v2.0 사용자 요청) — 여러 개로 만들었으면 어느 것의 분류를
     고칠지 먼저 고른다. 하나뿐이면 고를 것이 없으니 선택 줄을 아예 두지 않는다. */
  const { list } = useSections();
  const secs = list('threads');
  const [secId, setSecId] = useState(MAIN_SEC);
  const cur = secs.find(s => s.id === secId) ? secId : MAIN_SEC;
  const cats = threadCats(settings, cur);
  const setCats = (next: ThreadCat[]) => patch(threadCatsPatch(settings, cur, next));
  const patchCat = (id: string, p: Partial<ThreadCat>) =>
    setCats(cats.map(c => (c.id === id ? { ...c, ...p } : c)));
  return (
    <div className="set-sec">
      <h3>默认视图</h3>
      <div className="d">进入讨论串菜单时首先显示的视图</div>
      <div className="set-row">
        <div className="l"><b>初始页面</b><small>讨论串视图/列表视图（海报卡片网格）</small></div>
        <div className="mini-seg">
          <button className={settings.defaultView === 'thread' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'thread' })}>讨论串视图</button>
          <button className={settings.defaultView === 'list' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'list' })}>列表视图</button>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>分类列表</h3>
      <div className="d">
        作品分类徽标：名称、背景/边框/文字颜色；拖动 ⠿ 调整顺序，可添加或删除
        {secs.length > 1 && <><br />每个讨论串可单独设置；<b>未修改时沿用默认讨论串的分类</b></>}
      </div>
      {secs.length > 1 && (
        <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {secs.map(s => (
            <button key={s.id} className={cur === s.id ? 'on' : ''} onClick={() => setSecId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      <DragList items={cats} keyOf={c => c.id} onReorder={next => setCats(next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span className="pill" style={threadBadgeStyle(c)}>{c.label || '分类'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              <span className="cp-lb">배경</span>
              <ColorField value={c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { bg: hex })} />
              <span className="cp-lb">테두리</span>
              <ColorField value={c.border ?? c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { border: hex })} />
              <span className="cp-lb">글씨</span>
              <ColorField value={c.fg ?? '#ffffff'} onChange={hex => patchCat(c.id, { fg: hex })} />
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                  const used = works.filter(w => w.catId === c.id && inSection(w.secId, cur)).length;
                  del.ask(`确定删除分类“${c.label}”吗？`,
                    () => setCats(cats.filter(x => x.id !== c.id)),
                    used > 0 ? `此分类下的 ${used} 个讨论串会保留，但分类会显示为“其他”。` : undefined);
                  }}>删除</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...cats, { id: newId(), label: '新分类' }])}>
          ＋ 添加
        </button>
      </div>
      {del.element}
    </div>
  );
}

/** 커미션 탭 (4.18) — 뱃지 모양·커미션/신청자 뱃지 스타일·전체 슬롯·신청자 리스트 공개범위·썸네일 비율 */
function CommBadgeRows({ list, shape, onChange, fixedIds }: {
  list: CommBadge[]; shape: 'round' | 'pill';
  onChange: (next: CommBadge[]) => void;
  fixedIds: string[];                      // 기본 제공 뱃지 — 삭제 불가
}) {
  const del = useConfirmDelete();
  const patch = (id: string, p: Partial<CommBadge>) =>
    onChange(list.map(b => (b.id === id ? { ...b, ...p } : b)));
  return (
    <>
      {list.map(b => (
        <div key={b.id} className="set-row" style={{ alignItems: 'center' }}>
          {/* 왼쪽: 뱃지 미리보기 하나만 (4.18 — 라벨 중복 표기 없음) */}
          <div className="l"><span style={badgeStyle(b, shape)}>{b.label || '뱃지'}</span></div>
          {/* 오른쪽 묶음: 글씨 인풋(맨 앞·오른쪽 정렬) + 배경/테두리/글씨색 */}
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            <KInput value={b.label} onChange={e => patch(b.id, { label: e.target.value })}
              style={{ width: 90, textAlign: 'right' }} />
            <span className="cp-lb">배경</span>
            <ColorField value={b.bg} onChange={hex => patch(b.id, { bg: hex })} />
            <span className="cp-lb">테두리</span>
            <ColorField value={b.border} onChange={hex => patch(b.id, { border: hex })} />
            <span className="cp-lb">글씨</span>
            <ColorField value={b.fg} onChange={hex => patch(b.id, { fg: hex })} />
            {!fixedIds.includes(b.id) && (
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => del.ask(`뱃지 「${b.label}」를 삭제하시겠습니까?`, () => onChange(list.filter(x => x.id !== b.id)), '이 뱃지를 쓰던 항목은 뱃지 없음으로 표시됩니다.')}>DELETE</button>
            )}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => onChange([...list, { id: newId(), label: '새 뱃지', bg: '#5d636d', border: '#4a505a', fg: '#ffffff' }])}>
          ＋ ADD BADGE
        </button>
      </div>
      {del.element}
    </>
  );
}

function CommPane() {
  const [st, patch] = useCommSettings();
  return (
    <div className="set-sec">
      <h3>커미션</h3>
      <div className="d">커미션 리스트·상세·신청자 리스트의 뱃지와 슬롯 설정 — 변경 즉시 반영</div>

      <div className="set-row">
        <div className="l"><b>썸네일 비율</b><small>커미션 갤러리 전체에 일괄 적용</small></div>
        <div className="mini-seg">
          <button className={st.ratio === '3:4' ? 'on' : ''} onClick={() => patch({ ratio: '3:4' })}>3:4 세로</button>
          <button className={st.ratio === '4:3' ? 'on' : ''} onClick={() => patch({ ratio: '4:3' })}>4:3 가로</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>뱃지 모양</b><small>커미션·신청자 뱃지 공통</small></div>
        <div className="mini-seg">
          <button className={st.badgeShape === 'round' ? 'on' : ''} onClick={() => patch({ badgeShape: 'round' })}>라운드 스퀘어</button>
          <button className={st.badgeShape === 'pill' ? 'on' : ''} onClick={() => patch({ badgeShape: 'pill' })}>동그란 필</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>전체 슬롯</b><small>동시에 받을 수 있는 총 슬롯 — 리스트 상단에 남은/전체로 표시 (수동 갱신)</small></div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>총</span>
          <KStep value={st.totalSlot} min={1} max={50} onChange={v => patch({ totalSlot: v, totalUsed: Math.min(st.totalUsed, v) })} />
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>사용</span>
          <KStep value={st.totalUsed} min={0} max={st.totalSlot} onChange={v => patch({ totalUsed: v })} />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>슬롯 표시 기준</b><small>리스트·상세에 3/5로 적을 때 앞 숫자를 무엇으로 볼지 — 운영 방식에 따라 다릅니다</small></div>
        <div className="mini-seg">
          <button className={(st.slotDisplay ?? 'used') === 'used' ? 'on' : ''} onClick={() => patch({ slotDisplay: 'used' })}>채워진 슬롯</button>
          <button className={st.slotDisplay === 'remain' ? 'on' : ''} onClick={() => patch({ slotDisplay: 'remain' })}>남은 슬롯</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>신청자 리스트 공개범위</b><small>리스트 자체의 공개 — 각 신청 내용은 별개(관리자/허용된 본인만)</small></div>
        <KSelect minWidth={130} value={st.applyVisibility} onChange={v => patch({ applyVisibility: v as CommSettings['applyVisibility'] })}
          options={[
            { value: 'public', label: '전체공개' },
            { value: 'member', label: '멤버공개' },
            { value: 'private', label: '비공개' },
          ]} />
      </div>

      <div className="set-row">
        <div className="l"><b>신청 휴지통 보관 기간</b><small>휴지통으로 옮긴 신청을 며칠 두었다가 없앨지 — 기간이 지나면 목록을 열 때 자동으로 사라집니다</small></div>
        <KStep value={st.trashDays ?? 30} min={1} max={365} suffix="일" onChange={v => patch({ trashDays: v })} />
      </div>

      <h3 style={{ marginTop: 26 }}>커미션 뱃지</h3>
      <div className="d">기본 3종(모집중·마감·준비중)은 고정 제공 — 글씨·색은 자유 수정</div>
      <CommBadgeRows list={st.commBadges} shape={st.badgeShape} fixedIds={['open', 'closed', 'ready']}
        onChange={next => patch({ commBadges: next })} />

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>신청자 리스트 뱃지</h3>
      <div className="d">대기·작업중·완료 — 커미션 뱃지와 색 변수 별도</div>
      <CommBadgeRows list={st.applyBadges} shape={st.badgeShape} fixedIds={['wait', 'working', 'done']}
        onChange={next => patch({ applyBadges: next })} />
    </div>
  );
}

/** BGM 트랙 한 줄 — 인라인 수정(제목/설명/URL) + 삭제 확인 */
function BgmTrackRow({ t, onPatch, onDelete }: {
  t: BgmTrack; onPatch: (p: Partial<BgmTrack>) => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.desc);
  const [url, setUrl] = useState(t.videoId);

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <KInput placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
          <KInput placeholder="설명 (선택)" value={desc} onChange={e => setDesc(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <KInput placeholder="유튜브 URL 또는 영상 ID" value={url} onChange={e => setUrl(e.target.value)} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              const vid = parseVideoId(url);
              if (!title.trim() || !vid) { toast('제목과 올바른 유튜브 URL(또는 영상 ID)을 입력해 주세요'); return; }
              onPatch({ title: title.trim(), desc: desc.trim(), videoId: vid });
              setEditing(false);
              toast('곡이 수정되었습니다');
            }}>SAVE</button>
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setTitle(t.title); setDesc(t.desc); setUrl(t.videoId); }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row" style={{ width: '100%' }}>
      <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <span className="drag-h">⠿</span>
        <div><b>{t.title}</b><small>{t.desc || t.videoId}</small></div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={onDelete}>DELETE</button>
      </div>
    </div>
  );
}

/** BGM 탭 (5.2 v1.9) — 곡 목록 등록(미니 플레이어 리스트에 노출) + 재생 설정 */
function BgmPane() {
  const { state, lists, setTracks, addTrack, removeTrack, addList, renameList, removeList, setSettings } = useBgm();
  const toast = useToast();
  const del = useConfirmDelete();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');
  /* 플레이리스트 여러 개 (커플홈 사용자 요청) — 고른 목록의 곡만 아래에서 다룬다 */
  const [cur, setCur] = useState(MAIN_LIST);
  const curList = lists.find(l => l.id === cur) ?? lists[0];
  const [newName, setNewName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => { setNameDraft(curList?.name ?? ''); }, [cur, curList?.name]);
  const commitName = () => { if (nameDraft.trim() && nameDraft.trim() !== curList?.name) renameList(cur, nameDraft); };

  const add = () => {
    if (addTrack(title, desc, url, cur)) {
      setTitle(''); setDesc(''); setUrl('');
      toast('곡이 추가되었습니다');
    } else {
      toast('제목과 올바른 유튜브 URL(또는 영상 ID)을 입력해 주세요');
    }
  };

  return (
    <div className="set-sec">
      <h3>BGM</h3>
      <div className="d">유튜브 곡 목록 관리 — 미니 플레이어 리스트에 노출 · 화면은 숨기고 소리만 재생 · 플레이리스트를 여러 개 만들면 플레이어의 곡 목록에서 고를 수 있습니다</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="mini-seg" style={{ flexWrap: 'wrap' }}>
          {lists.map(l => (
            <button key={l.id} className={l.id === cur ? 'on' : ''} onClick={() => setCur(l.id)}>
              {l.name} <small style={{ opacity: .6 }}>{l.tracks.length}</small>
            </button>
          ))}
        </div>
        <KInput placeholder="새 플레이리스트 이름" value={newName} onChange={e => setNewName(e.target.value)} style={{ maxWidth: 160 }}
          onKeyDown={e => { if (e.key === 'Enter') { const id = addList(newName); if (id) { setCur(id); setNewName(''); } } }} />
        <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
          onClick={() => {
            const id = addList(newName);
            if (id) { setCur(id); setNewName(''); toast('플레이리스트를 만들었습니다 — 아래에서 곡을 넣어 주세요'); }
            else toast('플레이리스트 이름을 입력해 주세요');
          }}>＋ 플레이리스트</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="cp-lb">이름</span>
        <KInput value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); }} style={{ maxWidth: 160 }} />
        {cur !== MAIN_LIST && (
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`「${curList?.name}」 플레이리스트를 삭제하시겠습니까? (곡 ${curList?.tracks.length ?? 0}개)`, () => { removeList(cur); setCur(MAIN_LIST); })}>
            DELETE
          </button>
        )}
      </div>

      <DragList
        items={curList?.tracks ?? []}
        keyOf={t => t.id}
        onReorder={next => setTracks(next, cur)}
        render={t => (
          <BgmTrackRow t={t}
            onPatch={p => setTracks((curList?.tracks ?? []).map(x => (x.id === t.id ? { ...x, ...p } : x)), cur)}
            onDelete={() => del.ask(`곡 「${t.title}」을 삭제하시겠습니까?`, () => removeTrack(t.id, cur))} />
        )}
      />
      {(curList?.tracks.length ?? 0) === 0 && <p className="hint">이 플레이리스트에 곡이 없습니다 — 아래에서 추가</p>}
      {del.element}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <KInput placeholder="곡 제목" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
        <KInput placeholder="설명 (선택)" value={desc} onChange={e => setDesc(e.target.value)} style={{ maxWidth: 130 }} />
        <KInput placeholder="유튜브 URL 또는 영상 ID" value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-dark" onClick={add}>＋ ADD</button>
      </div>

      <div className="set-row" style={{ marginTop: 16 }}>
        <div className="l"><b>기본 볼륨</b></div>
        <KStep value={state.settings.volume} min={0} max={100} suffix="%" onChange={v => setSettings({ volume: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>플레이어 위치</b><small>기본: 오른쪽 아래</small></div>
        <div className="mini-seg">
          <button className={state.settings.position === 'br' ? 'on' : ''} onClick={() => setSettings({ position: 'br' })}>오른쪽 아래</button>
          <button className={state.settings.position === 'bl' ? 'on' : ''} onClick={() => setSettings({ position: 'bl' })}>왼쪽 아래</button>
        </div>
      </div>
      {/* PC에서도 하단 바 (커플홈 사용자 요청) — 모바일 바와 같은 모양, 접기·볼륨 생략 */}
      <div className="set-row">
        <div className="l"><b>PC에서도 하단 바</b><small>모바일처럼 화면 아래에 붙는 슬림 바로 (레코드판·볼륨·접기 없음)</small></div>
        <KToggle checked={!!state.settings.dock} onChange={v => setSettings({ dock: v })} />
      </div>
      {lists.length > 1 && (
        <div className="set-row">
          <div className="l"><b>처음 재생할 플레이리스트</b><small>방문자가 플레이어에서 바꾼 선택은 그 브라우저에만 기억됩니다</small></div>
          <KSelect minWidth={150} value={lists.some(l => l.id === state.settings.defList) ? state.settings.defList! : MAIN_LIST}
            onChange={v => setSettings({ defList: v === MAIN_LIST ? undefined : v })}
            options={lists.map(l => ({ value: l.id, label: l.name }))} />
        </div>
      )}
      <div className="set-row">
        <div className="l"><b>셔플</b></div>
        <KToggle checked={state.settings.shuffle} onChange={v => setSettings({ shuffle: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>반복 재생</b><small>목록 끝에서 처음으로</small></div>
        <KToggle checked={state.settings.repeat} onChange={v => setSettings({ repeat: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>플레이어 표시</b><small>끄면 사이트에서 BGM 플레이어가 사라짐</small></div>
        <KToggle checked={state.settings.enabled} onChange={v => setSettings({ enabled: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>재생 방식</b><small>자동: 접속 후 처음 클릭/키 입력하는 순간 재생 (브라우저 정책상 완전 무동작 자동재생은 불가) · 수동: 재생 버튼을 눌러야 재생</small></div>
        <div className="mini-seg">
          <button className={state.settings.autoplay ? 'on' : ''}
            onClick={() => setSettings({ autoplay: true })}>접속 시 자동 재생</button>
          <button className={!state.settings.autoplay ? 'on' : ''}
            onClick={() => setSettings({ autoplay: false })}>버튼 눌러야 재생</button>
        </div>
      </div>
    </div>
  );
}

/** 폰트 목록 한 줄 — CSS URL 표시 · 수정(이름/family/URL, 업로드 폰트는 이름/한글 페어) · 삭제 */
function FontRow({ f }: { f: FontDef }) {
  const { fonts, familyOf, updateFont, removeFont, resetFont, setFontPair } = useFonts();
  const del = useConfirmDelete();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [family, setFamily] = useState(f.family);
  const [cssUrl, setCssUrl] = useState(fontCssUrl(f) ?? '');

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <KInput placeholder="표시 이름" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 160 }} />
          {f.fileId ? (
            /* 업로드 폰트 — family는 자동, 한글 페어만 지정 (v1.9) */
            <>
              <span className="cp-lb">한글 페어</span>
              <KSelect minWidth={150} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '페어 없음' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          ) : (
            <>
              <KInput placeholder="font-family 값" value={family} onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              {/* 웹폰트도 한글 페어 지정 가능 (v1.9) */}
              <span className="cp-lb">한글 페어</span>
              <KSelect minWidth={140} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '페어 없음' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {!f.fileId && <KInput placeholder="CSS URL" value={cssUrl} onChange={e => setCssUrl(e.target.value)} />}
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: f.fileId ? 'auto' : undefined }}
            onClick={() => {
              if (updateFont(f.id, { name, family: f.fileId ? f.family : family, cssUrl: f.fileId ? '' : cssUrl })) { setEditing(false); toast('폰트가 수정되었습니다'); }
              else toast('이름과 font-family 값을 입력해 주세요');
            }}>SAVE</button>
          {/* 내장 폰트를 처음 상태로 (v2.0 사용자 발견) — 이름·family·한글 페어를 한꺼번에 되돌린다.
              잘못 들어간 값(엉뚱한 family, 지워진 폰트를 가리키는 페어)을 풀 방법이 없었다 */}
          {f.builtin && (
            <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                resetFont(f.id);
                setEditing(false);
                toast(`「${f.name}」를 처음 상태로 되돌렸습니다`);
              }}>기본값으로</button>
          )}
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setName(f.name); setFamily(f.family); setCssUrl(fontCssUrl(f) ?? ''); }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row">
      <div className="l" style={{ minWidth: 0 }}>
        {/* 미리보기는 페어 반영 스택 — 영문 폰트+한글 페어면 한글이 페어 폰트로 보임 (v1.9) */}
        {/* familyOf가 페어까지 합쳐 주고 var(--serif) 같은 별칭도 원본 스택으로 풀어 준다 (v2.0) */}
        <b style={{ fontFamily: familyOf(f.id), fontSize: 15 }}>{f.name} — 가나다 ABC 123</b>
        <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.fileId
            ? `업로드 파일 — ${f.fileName ?? '폰트 파일'}${f.pairId ? ` · 한글 페어: ${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`
            : `${fontCssUrl(f) ?? (f.locked ? '사이트 기본 폰트 스택 — 별도 URL 없음' : '사이트 CSS에서 로드')}${f.pairId ? ` · 한글 페어: ${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`}
        </small>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        {!f.locked && (
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`폰트 「${f.name}」를 삭제하시겠습니까?`, () => removeFont(f.id),
                f.builtin
                  ? '기본 폰트는 목록에서만 빠집니다 — 아래 [복원] 버튼으로 되살릴 수 있고, 이 폰트를 쓰던 항목 표시는 그대로입니다.'
                  // 직접 등록한 폰트는 정의째 사라지므로 가리키던 자리도 함께 정리된다 (v2.0)
                  : '직접 등록한 폰트는 복구할 수 없습니다. 이 폰트를 쓰도록 지정해 둔 자리(역할 폰트·한글 페어)는 기본값으로 되돌아갑니다.')}>DELETE</button>
        )}
      </div>
      {del.element}
    </div>
  );
}

/** 폰트 탭 (5.1) — 내장 폰트도 수정·삭제 가능 · 웹폰트 URL 등록. 파일 업로드·페어링은 후속 */
function FontPane() {
  const { fonts, hiddenCount, addFont, addFontFile, restoreBuiltins } = useFonts();
  const toast = useToast();
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [cssUrl, setCssUrl] = useState('');
  // 웹폰트 추가의 한글 페어 (v1.9) — 체크하면 지정 가능
  const [webPairOn, setWebPairOn] = useState(false);
  const [webPair, setWebPair] = useState('');
  // 폰트 파일 업로드 (v1.9) — 표시 이름은 파일명 그대로 (EDIT에서 수정 가능, 사용자 확정)
  const [upPair, setUpPair] = useState('');
  const uploadFontFile = async (f: File | undefined) => {
    if (!f) return;
    const name = f.name.replace(/\.(woff2?|ttf|otf)$/i, '');
    if (await addFontFile(name, f, upPair || undefined)) { setUpPair(''); toast(`「${name}」 폰트가 등록되었습니다`); }
  };

  return (
    <div className="set-sec">
      <h3>폰트 라이브러리</h3>
      <div className="d">캐릭터 프로필·자관 이름·시나리오 타이틀 등에서 이 목록 중 선택해 사용 — 원하는 폰트만 남기고 삭제 가능</div>

      {fonts.map(f => <FontRow key={f.id} f={f} />)}
      {hiddenCount > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={restoreBuiltins}>
            삭제한 기본 폰트 {hiddenCount}개 복원
          </button>
        </div>
      )}
      <p className="hint">삭제해도 이미 그 폰트를 쓰고 있는 캐릭터·자관 표시는 깨지지 않습니다 — 선택 목록에서만 빠집니다</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <label className="k-label" style={{ margin: 0 }}>웹폰트 추가 — 눈누/구글폰트의 CSS 링크(URL)와 font-family 값</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KInput placeholder="표시 이름" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 130 }} />
          <KInput placeholder="font-family 값" value={family}
            onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <KInput placeholder="CSS URL (https://fonts.googleapis.com/... 또는 눈누 링크)" value={cssUrl}
            onChange={e => setCssUrl(e.target.value)} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              if (addFont(name, family, cssUrl, webPairOn ? webPair || undefined : undefined)) {
                setName(''); setFamily(''); setCssUrl(''); setWebPairOn(false); setWebPair('');
                toast('폰트가 추가되었습니다');
              } else toast('이름과 font-family 값을 입력해 주세요');
            }}>＋ ADD</button>
        </div>
        {/* 영문·일어 등 한글 미지원 웹폰트 — 체크하면 한글 페어 지정 (v1.9 사용자 요청) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <KCheck label="한글 페어 지정" checked={webPairOn} onChange={setWebPairOn} />
          {webPairOn && (
            <KSelect minWidth={160} value={webPair} onChange={setWebPair}
              options={[{ value: '', label: '페어 없음' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          )}
        </div>
      </div>

      {/* 폰트 파일 업로드 (v1.9) — woff2·woff·ttf·otf + 영문 폰트의 한글 페어링 */}
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <label className="k-label" style={{ margin: 0 }}>폰트 파일 업로드 — woff2·woff·ttf·otf</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="cp-lb">한글 페어</span>
          <KSelect minWidth={160} value={upPair} onChange={setUpPair}
            options={[{ value: '', label: '페어 없음' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          <label className="btn btn-dark" style={{ whiteSpace: 'nowrap', cursor: 'var(--cur-pointer,pointer)' }}
            {...fileDrop(fl => uploadFontFile(fl[0]))}>
            ↑ 파일 선택
            <input type="file" accept=".woff2,.woff,.ttf,.otf" style={{ display: 'none' }}
              onChange={e => { uploadFontFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <p className="hint">표시 이름은 파일명 그대로 등록 — 목록의 [EDIT]에서 수정. 한글 미지원 폰트라면 한글 페어를 지정 — 한글 글자는 페어 폰트로 표시됩니다.</p>
      </div>
    </div>
  );
}

function SettingsInner() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState<(typeof CATEGORIES)[number]>('디자인');
  // 탭별 주소 (v1.9 사용자 요청) — /settings?tab=… : 뒤로가기로 이전 탭 복귀, 회원 상세에서 돌아오기 등
  const urlTab = params.get('tab');
  useEffect(() => {
    if (urlTab && (CATEGORIES as readonly string[]).includes(urlTab)) setTabState(urlTab as (typeof CATEGORIES)[number]);
    else if (!urlTab) setTabState('디자인');
  }, [urlTab]);
  const setTab = (t: (typeof CATEGORIES)[number]) => {
    setTabState(t);
    router.push(`/settings?tab=${encodeURIComponent(t)}`);
  };

  // 모바일에서는 환경설정 미제공 (v1.9 사용자 확정 — 수정할 정보량이 모바일에 맞지 않음)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  /* 미리보기는 이 페이지 안에서만 — SAVE 없이 벗어나면 저장본으로 원복 (v1.9).
     **색만 지키고 있었다** (v2.0 사용자 발견 — 「폰트 바꾸고 SAVE 안 했는데 화면 전환이 되고
     적용돼 있어」). 디자인 탭의 SAVE는 색·역할 폰트·로고/탭 제목 **셋**을 함께 저장하는데,
     이탈 경고와 원복은 색(useTheme)만 보고 있었다. 나머지 둘은 모듈·프로바이더에 사는
     드래프트라 페이지를 떠나도 사라지지 않아, 저장한 것처럼 계속 적용된 채로 남았다. */
  const { dirty: themeDirty, discard: themeDiscard, save: themeSave } = useTheme();
  const { rolesDirty, saveRoles, discardRoles } = useFonts();
  const siteDraft = useSiteDraft();
  const dirty = themeDirty || rolesDirty || siteDraft.dirty;
  const save = () => { themeSave(); saveRoles(); siteDraft.save(); };
  const discard = () => { themeDiscard(); discardRoles(); siteDraft.discard(); };
  const themeRef = useRef({ dirty, discard });
  themeRef.current = { dirty, discard };
  useEffect(() => () => { if (themeRef.current.dirty) themeRef.current.discard(); }, []);

  // 미저장 변경이 있을 때 상단바로 이동하려 하면 경고 (v1.9 — 캡처 단계에서 클릭 보류)
  const [leaveAsk, setLeaveAsk] = useState(false);
  const pendingClick = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onCapture = (e: MouseEvent) => {
      if (!themeRef.current.dirty) return;
      const t = e.target as HTMLElement | null;
      const hit = t?.closest?.('.topbar a, .topbar button, .topbar .brand') as HTMLElement | null;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      pendingClick.current = hit;
      setLeaveAsk(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, []);
  const leaveWith = (action: 'save' | 'discard') => {
    if (action === 'save') save(); else discard();
    setLeaveAsk(false);
    const el = pendingClick.current;
    pendingClick.current = null;
    // dirty 해제 후 보류했던 클릭 재실행 → 원래 목적지로 이동
    setTimeout(() => el?.click(), 30);
  };

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>SETTINGS</PageTitle><p>관리자 전용 페이지</p></div>
        <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>관리자로 로그인하면 환경설정을 사용할 수 있습니다.</p>
        </div>
      </section>
    );
  }
  if (isMobile) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>SETTINGS</PageTitle><p>PC 전용 페이지</p></div>
        <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>환경설정은 PC 화면에서 이용할 수 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>SETTINGS</PageTitle>
        {/* 관리자 클릭 수정 가능 (v1.9 — 다른 페이지 설명과 동일) */}
        <EditableDesc k="settings-desc" def="노코드 커스터마이징 — 모든 컨트롤은 자체 UI 킷 (기본 브라우저 UI 미사용)" />
      </div>

      {/* 미저장 테마 변경 이탈 경고 (v1.9) */}
      <ConfirmModal open={leaveAsk} title="테마가 저장되지 않았습니다"
        body="이대로 이동하면 미리보기 중인 변경사항이 사라지고 저장된 테마로 돌아갑니다."
        onClose={() => { pendingClick.current = null; setLeaveAsk(false); }}
        buttons={[
          { label: '저장 후 이동', kind: 'dark', onClick: () => leaveWith('save') },
          { label: '저장하지 않고 이동', kind: 'ghost', onClick: () => leaveWith('discard') },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingClick.current = null; setLeaveAsk(false); } },
        ]} />
      <div className="settings-layout">
        <div className="panel set-nav">
          {CATEGORIES.map(c => (
            <button key={c} className={tab === c ? 'on' : ''} onClick={() => setTab(c)}>{c}</button>
          ))}
        </div>
        <div className="panel" style={{ padding: 26 }}>
          {tab === '디자인' ? (
            <DesignPane />
          ) : tab === '메인 페이지' ? (
            <MainPagePane />
          ) : tab === '위젯' ? (
            <WidgetsPane />
          ) : tab === '메뉴 관리' ? (
            <MenuPane />
          ) : tab === '게시판 관리' ? (
            <BoardPane />
          ) : tab === '캐릭터' ? (
            <CharPane />
          ) : tab === '자관 질문' ? (
            <RelQPane />
          ) : tab === 'TRPG' ? (
            <TrpgPane />
          ) : tab === '감상타래' ? (
            <ThreadPane />
          ) : tab === '메모장' ? (
            <MemoPane />
          ) : tab === '다이어리' ? (
            <>
              <MoodPane />
              <DiaryCatPane />
            </>
          ) : tab === 'BGM' ? (
            <BgmPane />
          ) : tab === '폰트' ? (
            <FontPane />
          ) : tab === '마우스 커서' ? (
            <CursorPane />
          ) : tab === '회원/보안' ? (
            <MemberPane />
          ) : tab === '데이터 백업' ? (
            <DataPane />
          ) : (
            <div className="set-sec">
              <h3>{tab}</h3>
              {/* (v1.9) 개발 마일스톤 문구 제거 — 배포본에는 노출하지 않음 */}
              <div className="d">설정 항목이 없습니다</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router) — 탭별 주소 (v1.9)
  return <Suspense fallback={<section className="page" />}><SettingsInner /></Suspense>;
}
