'use client';
// 로그인 카드 (v2.1) — 메인(비로그인)과 /login 페이지가 같이 쓴다.
// 회원가입(가입코드) · 비밀번호 찾기 포함. 가입코드가 곧 어느 자관(홈)의 회원이 되는지를 정한다.
import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { KInput } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc } from '@/components/ui/PageText';

export function LoginCard({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { login, signup, findId, resetPassword, mock } = useAuth();
  const toast = useToast();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // 회원가입 폼
  const [sId, setSId] = useState('');
  const [sPw, setSPw] = useState('');
  const [sNick, setSNick] = useState('');
  const [sEmail, setSEmail] = useState('');   // 가입 이메일 (v1.9 — 아이디 찾기/비번 리셋용)
  const [sCode, setSCode] = useState('');
  const [sErr, setSErr] = useState('');
  // 아이디/비밀번호 찾기
  const [fEmail, setFEmail] = useState('');
  const [fErr, setFErr] = useState('');
  const [fInfo, setFInfo] = useState('');     // 결과 안내 (아이디·임시 비밀번호)

  const doLogin = async () => {
    setErr(''); setBusy(true);
    const r = await login(id.trim(), pw);
    if (!r.ok) { setErr(r.error ?? '登录失败'); setBusy(false); return; }
    toast('登录成功');
    onLoggedIn?.();
    // 서버 모드는 login()이 새로고침한다 — 그동안 버튼을 잠근 채로 둔다
    if (mock) setBusy(false);
  };

  const doSignup = async () => {
    setSErr(''); setBusy(true);
    // 서버 모드에서는 아이디가 곧 이메일 — 따로 받지 않고 그대로 쓴다
    const r = await signup(sId.trim(), sPw, sNick.trim(), sCode.trim(), (mock ? sEmail : sId).trim());
    if (!r.ok) { setSErr(r.error ?? '注册失败'); setBusy(false); return; }
    setSignupOpen(false);
    toast(mock ? '注册成功，请使用新账号登录' : '注册成功，正在进入角色关系主页');
    if (mock) setBusy(false);
  };

  // 아이디 찾기 (v1.9) — 가입 이메일로
  const doFindId = async () => {
    setFErr(''); setFInfo('');
    const r = await findId(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '请求失败'); return; }
    setFInfo(`账号：${r.foundId}`);
  };

  const doFind = async () => {
    setFErr(''); setFInfo('');
    const r = await resetPassword(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '请求失败'); return; }
    if (r.tempPassword) setFInfo(`临时密码：${r.tempPassword}，登录后请在个人主页修改`);
    else { setFindOpen(false); toast('重置链接已发送至邮箱'); }
  };

  return (
    <>
      {/* 타이틀은 카드 안 가운데 정렬 (v1.9 — 메뉴 페이지가 아니라 상단 대제목을 두지 않음) */}
      <div className="panel" style={{ padding: 28, maxWidth: 480, margin: '40px auto 0' }}>
        {/* 타이틀 폰트가 아니라 기본 세리프 (커플홈 사용자 요청 — 타이틀 폰트는 로고·페이지 제목 자리에만) */}
        <h1 style={{
          fontFamily: 'var(--serif-base)', fontSize: 24, letterSpacing: '.3em', textAlign: 'center',
          margin: '4px 0 6px', color: 'var(--ink)',
        }}>LOGIN</h1>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <EditableDesc k="login-desc" def="登录后进入我的角色关系主页" />
        </div>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder={mock ? '账号' : '邮箱'} value={id} onChange={e => setId(e.target.value)} autoComplete="username" />
          <KInput placeholder="密码" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password"
            onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
          {err && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{err}</p>}
          <button className="btn btn-dark" style={{ justifyContent: 'center', padding: 10 }} disabled={busy} onClick={doLogin}>
            {busy ? '正在验证…' : '登录'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
            onClick={() => setSignupOpen(true)}>注册</button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
            onClick={() => setFindOpen(true)}>找回密码</button>
        </div>
      </div>

      {/* 회원가입 모달 (4.8 — 가입코드 방식) */}
      <Modal open={signupOpen} onClose={() => setSignupOpen(false)} small
        title="注册" desc="邀请码决定你加入哪个角色关系主页，请向主页管理员获取"
        dirty={!!(sId || sPw || sNick || sCode)}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setSignupOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" disabled={busy} onClick={doSignup}>{busy ? '处理中…' : '注册'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder={mock ? '账号' : '邮箱（账号）'} value={sId} onChange={e => setSId(e.target.value)} />
          <KInput placeholder="密码" type="password" value={sPw} onChange={e => setSPw(e.target.value)} />
          <KInput placeholder="昵称" value={sNick} onChange={e => setSNick(e.target.value)} />
          {/* 서버 모드는 이메일이 곧 아이디라 다시 받지 않는다 (로컬 계정에서만 별도 입력) */}
          {mock && (
            <KInput placeholder="邮箱（用于找回账号或密码）" value={sEmail} onChange={e => setSEmail(e.target.value)} />
          )}
          <KInput placeholder="邀请码" value={sCode} onChange={e => setSCode(e.target.value)} />
          {sErr && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{sErr}</p>}
        </div>
      </Modal>

      {/* 아이디·비밀번호 찾기 모달 (4.8, v1.9) — 가입 이메일 기준 */}
      <Modal open={findOpen} onClose={() => { setFindOpen(false); setFInfo(''); setFErr(''); }} small
        title={mock ? '找回账号或密码' : '重置密码'}
        desc={mock
          ? '使用注册邮箱找回账号或获取临时密码'
          : '向注册邮箱发送密码重置链接'}
        dirty={!!fEmail}
        actions={<>
          <button className="btn btn-ghost" onClick={() => { setFindOpen(false); setFInfo(''); setFErr(''); }}>CANCEL</button>
          {/* 서버 모드는 이메일이 곧 아이디라 「아이디 찾기」가 의미 없다 */}
          {mock && <button className="btn btn-ghost" onClick={doFindId}>找回账号</button>}
          <button className="btn btn-dark" onClick={doFind}>{mock ? '获取临时密码' : '发送'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="邮箱" value={fEmail} onChange={e => setFEmail(e.target.value)} />
          {fErr && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{fErr}</p>}
          {fInfo && <p style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{fInfo}</p>}
        </div>
      </Modal>
    </>
  );
}
