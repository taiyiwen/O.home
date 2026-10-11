'use client';
// UI 킷 데모 — 0차 결과물 확인용 (기획서 7장 "예쁜 컨트롤")
import React, { useState } from 'react';
import {
  KInput, KTextarea, KCheck, KRadio, KToggle, KStep, KSelect, SearchBar, Pager, Tip,
} from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { FileDrop } from '@/components/ui/FileDrop';
import { CropEditor, CropValue, CropAspect } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function UiKitPage() {
  const toast = useToast();
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState('a');
  const [toggle, setToggle] = useState(true);
  const [num, setNum] = useState(5);
  const [sel, setSel] = useState('md');
  const [color, setColor] = useState('#a63a45');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [text, setText] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<CropAspect>('3:4');
  const [cropResult, setCropResult] = useState<CropValue | null>(null);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>UI KIT</PageTitle>
        <p>全面替换浏览器默认界面 — 所有功能均使用这些组件</p>
        <div className="head-actions">
          <SearchBar onSearch={q => toast(`搜索：${q || '（空）'}`)} />
          <button className="btn btn-dark" onClick={() => toast('按钮已点击')}>✎ 写入</button>
        </div>
      </div>

      <div className="panel">
        <div className="set-sec">
          <h3>输入</h3>
          <div className="d">文本输入框 · 高度自动调整的多行文本框</div>
          <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
            <KInput placeholder="输入文本" />
            <KTextarea placeholder="文本框高度会随内容自动增加" value={text} onChange={e => setText(e.target.value)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>选择控件</h3>
          <div className="d">复选框 15px · 单选框 14px · 开关 · 步进器</div>
          <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
            <KCheck label="复选框" checked={check} onChange={setCheck} />
            <KRadio label="单选 A" value="a" current={radio} onChange={setRadio} name="demo" />
            <KRadio label="单选 B" value="b" current={radio} onChange={setRadio} name="demo" />
            <KToggle label="开关" checked={toggle} onChange={setToggle} />
            <KStep value={num} onChange={setNum} />
          </div>
        </div>

        <div className="set-sec">
          <h3>下拉菜单 · 颜色 · 工具提示</h3>
          <div className="d">自定义选择器、颜色选择器和工具提示</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect
              value={sel}
              onChange={setSel}
              options={[
                { value: 'md', label: 'Markdown' },
                { value: 'html', label: 'HTML' },
                { value: 'txt', label: '纯文本' },
              ]}
            />
            <ColorField value={color} onChange={setColor} />
            <Tip tip="自定义样式工具提示">
              <span className="pill">悬停查看</span>
            </Tip>
            <Tip tip="跟随下拉菜单颜色的样式">
              <span className="pill dark">此样式</span>
            </Tip>
          </div>
        </div>

        <div className="set-sec">
          <h3>按钮</h3>
          <div className="d">发布/写入按钮与搜索框高度一致，固定为 35px</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-dark">＋ 添加角色</button>
            <button className="btn btn-accent">发布</button>
            <button className="btn btn-ghost">取消</button>
            <button className="btn btn-dark" onClick={() => setModal(true)}>打开弹窗</button>
            <button className="btn btn-ghost" onClick={() => toast('这是一条提示消息')}>提示消息</button>
          </div>
        </div>

        <div className="set-sec">
          <h3>文件上传</h3>
          <div className="d">拖放区域和文件大小显示</div>
          <div style={{ maxWidth: 460 }}>
            <FileDrop multiple onFiles={fs => toast(`已选择 ${fs.length} 个文件`)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>缩略图裁剪编辑器</h3>
          <div className="d">选择图片后可拖动、缩放，并使用固定比例和三分辅助线进行裁剪</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={120} value={cropAspect} onChange={v => setCropAspect(v as CropAspect)}
              options={[
                { value: '3:4', label: '3:4（角色）' },
                { value: '4:3', label: '4:3（角色关系）' },
                { value: '16:9', label: '16:9（票券/剧本）' },
                { value: '1:1', label: '1:1' },
              ]} />
            <div style={{ maxWidth: 320, flex: 1 }}>
              <FileDrop accept="image/*" label="选择要裁剪的图片"
                onFiles={fs => { if (fs[0]) setCropSrc(URL.createObjectURL(fs[0])); }} />
            </div>
            {cropResult && (
              <span className="pill">crop: x {Math.round(cropResult.x)} · y {Math.round(cropResult.y)} · {cropResult.scale.toFixed(2)}×</span>
            )}
          </div>
          {cropSrc && (
            <CropEditor open={!!cropSrc} src={cropSrc} aspect={cropAspect}
              onClose={() => setCropSrc(null)}
              onApply={c => { setCropResult(c); setCropSrc(null); toast('裁剪位置已保存（原图未修改）'); }} />
          )}
        </div>

        <div className="set-sec">
          <h3>列表悬停 · 分页</h3>
          <div className="d">鼠标悬停时更改行背景和文字颜色，不会超出圆角边界</div>
          <div className="hover-list" style={{ border: '1px solid var(--line)' }}>
            {['第一篇帖子标题', '第二篇帖子标题', '第三篇帖子标题'].map(t => (
              <div className="row" key={t}><span className="pill">闲聊</span>{t}</div>
            ))}
          </div>
          <Pager page={page} total={4} onChange={setPage} />
        </div>
      </div>

      <ConfirmModal
        open={modal}
        title="要退出编辑吗？"
        body="未保存的更改将会丢失。"
        onClose={() => setModal(false)}
        buttons={[
          { label: '保存并退出', kind: 'dark', onClick: () => { setModal(false); toast('已保存'); } },
          { label: '不保存并退出', kind: 'ghost', onClick: () => setModal(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setModal(false) },
        ]}
      />
    </section>
  );
}
