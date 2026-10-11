'use client';
// 도토리 등록/수정 공용 폼 (4.15) — 16:9 이미지 + 시나리오 정보 + 상태
import React, { useState } from 'react';
import { DotoriItem, DotoriStatus, DOTORI_STATUS_KEYS, useTrpgSettings } from '@/lib/galleryStore';
import { KInput, KSelect } from '@/components/ui/Kit';
import { CropEditor, CropValue, CropImg, CroppedBlobImg } from '@/components/ui/CropEditor';
import { putBlob } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

export interface DotoriFormValue {
  name: string; writer: string; rule: string; people: string;
  tags: string[]; link?: string; status: DotoriStatus;
  imgId?: string; thumbCrop?: CropValue;
}

export function DotoriForm({ initial, onSave, onCancel }: {
  initial: DotoriItem | null;
  onSave: (v: DotoriFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [trpgSet] = useTrpgSettings(); // 상태 라벨 (환경설정 > TRPG)
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [writer, setWriter] = useState(initial?.writer ?? '');
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [people, setPeople] = useState(initial?.people ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [link, setLink] = useState(initial?.link ?? '');
  // 새로 담는 시나리오는 대개 아직 일정이 없다 — 기본값을 「일정 미정」으로 (사용자 확정)
  const [status, setStatus] = useState<DotoriStatus>(initial?.status ?? 'undecided');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [removed, setRemoved] = useState(false);
  const [crop, setCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast('请输入剧本名称'); return; }
    onSave({
      name: name.trim(), writer: writer.trim(), rule: rule.trim(), people: people.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      link: link.trim() || undefined, status,
      imgId: file ? await putBlob(file) : (removed ? undefined : initial?.imgId),
      thumbCrop: crop,
    });
  };

  return (
    <div className="write-grid">
      {/* 좌: 이미지 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <label className="k-label" style={{ margin: 0 }}>
          图片 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 卡片缩略图比例为 16:9，不会裁切原图（选填）</span>
        </label>
        <div style={{ aspectRatio: '16/9', borderRadius: 9, overflow: 'hidden', position: 'relative', border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }} onClick={() => document.getElementById('dtImgF')?.click()}>
          {fileUrl
            ? <CropImg src={fileUrl} crop={crop} />
            : (!removed && initial?.imgId)
              ? <CroppedBlobImg fileRef={initial.imgId} crop={crop} ph="" />
              : <div className="ph" style={{ position: 'absolute', inset: 0 }}><span style={{ fontSize: 10 }}>SCENARIO</span></div>}
        </div>
        <input id="dtImgF" type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setFileUrl(URL.createObjectURL(f)); setRemoved(false); setCrop(undefined); setCropOpen(true); }
            e.target.value = '';
          }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {(fileUrl || (!removed && initial?.imgId)) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => setCropOpen(true)}>✂ 设置缩略图位置</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => { setFile(null); setFileUrl(''); setRemoved(true); setCrop(undefined); }}>移除图片</button>
            </>
          )}
        </div>
      </div>

      {/* 우: 정보 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>剧本</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="剧本名称" value={name} onChange={e => setName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="作者" value={writer} onChange={e => setWriter(e.target.value)} />
              <KInput placeholder="规则" value={rule} onChange={e => setRule(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="人数" value={people} onChange={e => setPeople(e.target.value)} style={{ maxWidth: 90 }} />
            </div>
            <KInput placeholder="标签 — 使用逗号分隔" value={tags} onChange={e => setTags(e.target.value)} />
            <KInput placeholder="链接（选填）" value={link} onChange={e => setLink(e.target.value)} />
            <KSelect value={status} onChange={v => setStatus(v as DotoriStatus)}
              options={DOTORI_STATUS_KEYS.map(s => ({ value: s, label: trpgSet.statuses[s].label }))} />
            <p className="hint" style={{ margin: 0 }}>卡片仅显示“待定”和“日程已确认”徽标；“已完成”状态仅显示在已完成标签中</p>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>取消</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? '添加' : '保存'}
          </button>
        </div>
      </div>

      {cropOpen && (fileUrl || initial?.imgId) && (
        <DtCrop src={fileUrl} refId={!fileUrl ? initial?.imgId : undefined} crop={crop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setCrop(c); setCropOpen(false); }} />
      )}
    </div>
  );
}

/** 새 파일(objectURL) 또는 저장 블롭을 소스로 16:9 크롭 */
import { useBlobUrl } from '@/lib/blobStore';
function DtCrop({ src, refId, crop, onClose, onApply }: {
  src: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const s = src || loaded;
  if (!s) return null;
  return <CropEditor open src={s} aspect="16:9" initial={crop} onClose={onClose} onApply={onApply} />;
}
