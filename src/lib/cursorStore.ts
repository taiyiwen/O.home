'use client';
// 마우스 커서 관리 (5.1 v1.1) — 상태별 커서 이미지(png 32px 권장) + 핫스팟 + 전체 on/off.
// 등록하지 않은 상태는 기본 커서로 폴백.
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

// 이동·크기조절 커서 분리 (v1.9 사용자 요청) — 이동/드래그 하나로 퉁치지 않고
// 윈도우 커서 세트처럼 이동 + 크기조절 4방향을 각각 등록
export type CursorState = 'default' | 'pointer' | 'text' | 'active' | 'grab'
  | 'rsNwse' | 'rsNesw' | 'rsEw' | 'rsNs';

export interface CursorEntry { imgId: string; hx: number; hy: number } // 핫스팟 (px)

export interface CursorSettings {
  enabled: boolean;
  states: Partial<Record<CursorState, CursorEntry>>;
}

export const CURSOR_STATE_LABEL: Record<CursorState, { label: string; desc: string }> = {
  default: { label: '默认', desc: '常规状态' },
  pointer: { label: '指针（悬停）', desc: '链接或按钮上方' },
  text: { label: '文本', desc: '输入框或文本上方（替代 I 形光标）' },
  active: { label: '按下时', desc: '按住期间（可选）' },
  grab: { label: '移动', desc: '拖动组件或便笺时（可选）' },
  rsNwse: { label: '调整大小 ↘', desc: '对角线调整 1，组件右下角手柄（可选）' },
  rsNesw: { label: '调整大小 ↙', desc: '对角线调整 2（可选）' },
  rsEw: { label: '调整大小 ↔', desc: '水平调整大小（可选）' },
  rsNs: { label: '调整大小 ↕', desc: '垂直调整大小（可选）' },
};

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = { enabled: true, states: {} };

const KEY = 'ohome.cursor.v1';
const EVT = 'ohome-cursor';

export function useCursorSettings(): [CursorSettings, (patch: Partial<CursorSettings>) => void, boolean] {
  const [st, setSt] = useState<CursorSettings>(DEFAULT_CURSOR_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => {
      try {
        const raw = getRawSetting(KEY);
        if (raw) setSt({ ...DEFAULT_CURSOR_SETTINGS, ...JSON.parse(raw) });
      } catch { /* 기본값 */ }
    };
    load();
    setLoaded(true);
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  const patch = useCallback((p: Partial<CursorSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(KEY, n); } catch { /* 무시 */ }
      setTimeout(() => window.dispatchEvent(new Event(EVT)), 0);
      return n;
    });
  }, []);
  return [st, patch, loaded];
}
