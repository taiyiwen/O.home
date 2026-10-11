'use client';
// 설치 초기 화면 (v2.0) — 배포본은 공개 홈 전용이라 서버 연결이 필수다.
// Supabase / Firebase 중 하나를 고르고, 연결값 입력 → 규칙(스키마) 적용 → 연결 확인 →
// 관리자 계정 만들기 → 설정 파일(ohome.config.json) 내려받기 순서로 진행한다.
// 백업 zip이 있으면 위 과정을 건너뛰고 바로 복원할 수 있다.
import React, { useEffect, useState } from 'react';
import { markSetupDone, isSetupDone } from '@/lib/auth';
import { importBackup } from '@/lib/backup';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { fileDrop } from '@/lib/dnd';
import {
  saveLocalConfig, configFileText, validateConfig, serverConfig, parseFirebaseSnippet,
} from '@/lib/serverConfig';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { createBackend } from '@/lib/backend';
import type { BackendCheck } from '@/lib/backend/types';
import { SCHEMA_SQL } from '@/lib/schemaSql';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [need, setNeed] = useState(false);
  // 자관(홈) 분리판(v2.1)은 Firebase만 지원한다 — 서비스 선택 없이 바로 Firebase 단계로
  const [kind, setKind] = useState<BackendKind | null>('firebase');

  // Supabase 입력
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  // Firebase 입력 — 콘솔에서 복사한 설정 뭉치를 붙여넣으면 자동으로 뜯어낸다
  const [fbPaste, setFbPaste] = useState('');
  const [fb, setFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '', messagingSenderId: '' });
  // 콘솔에서 데이터베이스를 (default) 아닌 이름으로 만든 경우에만 입력 (보통 비워 둔다)
  const [fbDbId, setFbDbId] = useState('');

  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<BackendCheck | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState('');

  // 관리자 계정
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [nick, setNick] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // 설정 등록 도우미 — 저장소 주소를 넣으면 GitHub 업로드 화면으로 바로 보낸다 (터미널 불필요)
  const [repo, setRepo] = useState('');
  const uploadUrl = (() => {
    const m = repo.trim().match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
    return m ? `https://github.com/${m[1]}/${m[2]}/upload/main/public` : '';
  })();

  useEffect(() => {
    if (serverConfig() || isSetupDone()) { setReady(true); return; }
    setNeed(true);
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!need) return <>{children}</>;

  const cfg = (): BackendConfig => (kind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: fb.apiKey.trim(),
        authDomain: fb.authDomain.trim() || `${fb.projectId.trim()}.firebaseapp.com`,
        projectId: fb.projectId.trim(),
        storageBucket: fb.storageBucket.trim() || `${fb.projectId.trim()}.appspot.com`,
        appId: fb.appId.trim(),
        messagingSenderId: fb.messagingSenderId.trim() || undefined,
        databaseId: fbDbId.trim() || undefined,
      }
    : { kind: 'supabase', url: sbUrl.trim(), anonKey: sbKey.trim() });

  // 저장소 CORS 열기 명령 — 입력한 버킷 이름을 그대로 넣어 준다 (백업에 이미지가 담기려면 필요)
  const corsCmd = [
    `echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json`,
    `gcloud storage buckets update gs://${fb.storageBucket.trim() || `${fb.projectId.trim() || '내프로젝트'}.firebasestorage.app`} --cors-file=cors.json`,
  ].join('\n');

  const restore = async (f: File) => {
    setErr(''); setBusy(true);
    try {
      await importBackup(f);
      markSetupDone();
      window.location.reload();
    } catch {
      setErr('恢复失败，请检查备份 ZIP 文件。');
      setBusy(false);
    }
  };

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setRulesOpen(true);
      setErr('自动复制不可用，请手动选择并复制下方内容。');
    }
  };

  const applyPaste = (text: string) => {
    setFbPaste(text);
    const v = parseFirebaseSnippet(text);
    if (v) {
      setFb(f => ({
        apiKey: v.apiKey ?? f.apiKey,
        authDomain: v.authDomain ?? f.authDomain,
        projectId: v.projectId ?? f.projectId,
        storageBucket: v.storageBucket ?? f.storageBucket,
        appId: v.appId ?? f.appId,
        messagingSenderId: v.messagingSenderId ?? f.messagingSenderId,
      }));
      setErr('');
    }
  };

  const runCheck = async () => {
    setErr(''); setCheck(null);
    const c = cfg();
    const bad = validateConfig(c);
    if (bad) { setErr(bad); return; }
    setChecking(true);
    try {
      const be = await createBackend(c);
      const r = await be.check();
      setCheck(r);
      if (!r.ok && r.reachable) setRulesOpen(true);
    } catch (e) {
      setErr(`连接失败：${(e as { message?: string })?.message ?? '请检查配置信息。'}`);
    }
    setChecking(false);
  };

  const signUpAdmin = async () => {
    setErr('');
    if (!email.trim() || !pw) { setErr('请输入邮箱和密码。'); return; }
    if (pw !== pw2) { setErr('两次输入的密码不一致。'); return; }
    if (pw.length < 6) { setErr('密码至少需要 6 个字符。'); return; }
    setSigning(true);
    try {
      const be = await createBackend(cfg());
      let r = await be.signUp(email.trim(), pw, nick.trim() || email.split('@')[0]);
      // 앞선 시도가 저장 도중 끊겨 로그인 계정만 남은 경우 — 같은 비밀번호로 들어가 이어서 진행한다
      if (!r.ok && /이미 사용 중/.test(r.error ?? '')) {
        const back = await be.signIn(email.trim(), pw);
        r = back.ok ? { ok: true } : {
          ok: false,
          error: '账号已存在。如果密码不同，请在 Firebase 控制台的 Authentication → Users 中删除该账号后重试。',
        };
      }
      if (!r.ok) { setErr(`创建账号失败：${r.error}`); setSigning(false); return; }
      // Firebase는 첫 계정을 소유자로 등록해야 관리자가 된다 (Supabase는 트리거가 처리)
      const claim = await be.claimOwner();
      if (!claim.ok) { setErr(`注册管理员失败：${claim.error}`); setSigning(false); return; }
      setSigned(true);
    } catch (e) {
      setErr(`创建账号失败：${(e as { message?: string })?.message ?? ''}`);
    }
    setSigning(false);
  };

  /** Vercel 환경변수로 등록할 때 붙여넣을 내용 */
  const envText = () => {
    const c = cfg();
    return c.kind === 'supabase'
      ? `NEXT_PUBLIC_SUPABASE_URL=${c.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${c.anonKey}`
      : [
          `NEXT_PUBLIC_FIREBASE_API_KEY=${c.apiKey}`,
          `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${c.projectId}`,
          `NEXT_PUBLIC_FIREBASE_APP_ID=${c.appId}`,
          `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
          `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${c.storageBucket}`,
          ...(c.databaseId ? [`NEXT_PUBLIC_FIREBASE_DATABASE_ID=${c.databaseId}`] : []),
        ].join('\n');
  };

  const downloadConfig = () => {
    const blob = new Blob([configFileText(cfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const start = () => {
    saveLocalConfig(cfg());
    markSetupDone();
    window.location.reload();
  };

  const doneStep = signed || (check?.ok && check.hasAdmin);

  return (
    <div className="setup-wrap">
      <div className="panel setup-box wide">
        <h1>O.HOME</h1>
        <p className="d">首次打开主页 — 连接数据库后即可开始使用</p>
        {/* 남의 완성된 홈에 들어왔는데 이 화면이 뜨는 경우 (v2.0 포크 제보) — 주인의 연결이
            그 브라우저에만 저장돼 배포에 안 올라간 상태다. 방문자가 주인에게 전달할 단서를 남긴다 */}
        <p className="hint" style={{ margin: '2px 0 10px' }}>
          如果你访问的是已创建主页的地址，却看到此页面，说明主页管理员尚未完成安装的最后一步
          “让访客也能访问”（上传 ohome.config.json）。请联系主页管理员。
        </p>

        {/* ── 백엔드 선택 ───────────────────────────────────── */}
        {!kind && (
          <>
            <button type="button" className="setup-pick" onClick={() => setKind('supabase')}>
              <b>Supabase</b>
              <small>基于 Postgres。可免费开始（1GB 存储），适合文字内容较多、图片较少的主页。</small>
            </button>
            <button type="button" className="setup-pick" onClick={() => setKind('firebase')}>
              <b>Firebase</b>
              <small>按用量计费（无固定费用）。图片存储免费额度为 5GB，适合图片较多的主页。</small>
            </button>
          </>
        )}

        {/* ── 연결 단계 ─────────────────────────────────────── */}
        {kind && (
          <ol className="setup-steps">
            {kind === 'supabase' ? (
              <>
                <li>
                  <b>创建 Supabase 项目</b>
                  <small>
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>에서
                    点击 <b>[New project]</b>。只需注意以下两项。
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>Region</b> — <b>Northeast Asia (Seoul)</b>
                      <em className="warn">之后无法更改。</em>
                      <em>免费方案也可以自由选择，因此选择距离较近的首尔速度最快。</em>
                    </li>
                    <li>
                      <b>Database Password</b> — 创建后请<b>妥善保存</b>
                      <em>此密码之后无法再次查看。使用主页时不需要，但将来直接连接数据库时会用到。</em>
                    </li>
                  </ul>
                  <small style={{ marginTop: 8 }}>
                    创建需要 1 到 2 分钟。完成后进入 <b>Project Settings → API</b>。
                  </small>
                </li>
                <li>
                  <b>粘贴 URL 和密钥</b>
                  <small>填写 Project URL 和 <b>anon public</b> 密钥。切勿填写 service_role 密钥。</small>
                  <label className="k-label">Project URL</label>
                  <KInput value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
                  <label className="k-label">anon public key</label>
                  <KInput value={sbKey} onChange={e => setSbKey(e.target.value)} />
                </li>
                <li>
                  <b>执行一次数据库架构 SQL</b>
                  <small>粘贴到 SQL Editor 并点击 [Run]，即可创建数据表、权限和图片存储空间。</small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
                      {copied === 'sql' ? '已复制 ✓' : '复制 SQL'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '收起内容' : '查看内容'}
                    </button>
                  </div>
                  {rulesOpen && <pre className="setup-sql">{SCHEMA_SQL}</pre>}
                </li>
              </>
            ) : (
              <>
                <li>
                  <b>创建 Firebase 项目</b>
                  <small>
                    <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">Firebase 콘솔</a>에서
                    创建项目后，按顺序完成以下步骤。
                    <b>项目位置之后无法更改</b>，请按下方说明选择。
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>1. Authentication</b> → 开始使用 → 启用<b>电子邮件/密码</b>登录方式
                      <em>如果不启用此选项，就无法在下方创建管理员账号。</em>
                    </li>
                    <li>
                      <b>2. Firestore Database</b> → 创建数据库 <span className="warn">（保存帖子和设置）</span>
                      <em>· 版本选择 <b>Standard</b> — Enterprise 面向大型服务，无需选择</em>
                      <em>· 位置选择 <b>asia-northeast3（首尔）</b> — 各地区免费额度相同，选择较近的区域更合适</em>
                      <em>· 安全规则选择<b>以生产模式启动</b> — 测试模式下任何人都能读写，为期 30 天</em>
                      <em>· 数据库 ID 保持 <b>(default)</b> — 更改后主页将无法找到数据库</em>
                    </li>
                    <li>
                      <b>3. Storage</b> → 开始使用 <span className="warn">（用于存储图片）</span>
                      <em>· 如需使用 5GB 免费额度，请选择 <b>us-west1（俄勒冈）</b> — 仅美国区域享有免费额度</em>
                      <em>· 如需更快速度，请选择 <b>asia-northeast3（首尔）</b> — 每月费用约为 1,000 韩元</em>
                      <em>· 即使选择美国区域，帖子和列表仍从首尔加载，页面会立即显示，图片稍后加载</em>
                      <em>· 系统可能要求切换到按量计费（Blaze）— 在免费额度内不会产生费用</em>
                    </li>
                    <li>
                      <b>4. 注册 Web 应用</b> → ⚙️ <b>项目设置 → 常规 → 页面底部“您的应用” → 添加应用 → Web</b>
                      <em className="warn">不是左侧菜单中的“App Hosting（应用托管）”。</em>
                      <em>App Hosting 用于直接在 Firebase 上运行主页；此主页已部署在 Vercel 上，不需要该功能。</em>
                    </li>
                    <li>
                      <b>5. 配置存储 CORS</b> <span className="warn">（备份时需要，建议现在完成）</span>
                      <em>Firebase Storage 默认禁止从其他地址<b>读取文件</b>。这不会影响主页查看图片，但<b>创建备份 ZIP 时会遗漏所有图片。</b></em>
                      <em>
                        <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a>
                        中选择此项目，打开右上角的 <b>{'>_'}（Cloud Shell）</b>，粘贴下方两行并按 Enter；无需安装程序。
                      </em>
                      <div className="setup-row" style={{ marginTop: 6 }}>
                        <button className="btn btn-ghost" onClick={() => copy(corsCmd, 'cors')}>
                          {copied === 'cors' ? '已复制 ✓' : '复制命令'}
                        </button>
                      </div>
                      <pre className="setup-sql" style={{ maxHeight: 92, marginTop: 6 }}>{corsCmd}</pre>
                      <em>此操作仅开放<b>读取（GET）</b>权限，图片本身已公开，不会带来新的风险。也可以之后再配置，但此前创建的备份不会包含图片。</em>
                    </li>
                  </ul>
                </li>
                <li>
                  <b>粘贴配置信息</b>
                  <small>粘贴添加 Web 应用后显示的完整 <b>firebaseConfig</b> 代码，字段会自动填充。</small>
                  <KTextarea value={fbPaste} onChange={e => applyPaste(e.target.value)}
                    style={{ minHeight: 90, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }} />
                  <div className="setup-2">
                    <div>
                      <label className="k-label">apiKey</label>
                      <KInput value={fb.apiKey} onChange={e => setFb(f => ({ ...f, apiKey: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">projectId</label>
                      <KInput value={fb.projectId} onChange={e => setFb(f => ({ ...f, projectId: e.target.value }))} />
                    </div>
                  </div>
                  <div className="setup-2">
                    <div>
                      <label className="k-label">appId</label>
                      <KInput value={fb.appId} onChange={e => setFb(f => ({ ...f, appId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">storageBucket</label>
                      <KInput value={fb.storageBucket} onChange={e => setFb(f => ({ ...f, storageBucket: e.target.value }))} />
                    </div>
                  </div>
                  <label className="k-label">数据库 ID（通常留空）</label>
                  <KInput value={fbDbId} onChange={e => setFbDbId(e.target.value)} />
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    仅当创建 Firestore 时使用了非 <b>(default)</b> 名称，才需要填写该名称。
                  </p>
                </li>
                <li>
                  <b>粘贴安全规则</b>
                  <small>
                    分别粘贴到 Firestore → <b>规则</b>和 Storage → <b>规则</b>中，并点击[发布]。
                    这些规则负责内容可见范围和作者编辑权限。
                  </small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
                      {copied === 'fs' ? '已复制 ✓' : '复制 Firestore 规则'}
                    </button>
                    <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
                      {copied === 'st' ? '已复制 ✓' : '复制 Storage 规则'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '收起内容' : '查看内容'}
                    </button>
                  </div>
                  {rulesOpen && (
                    <>
                      <pre className="setup-sql">{FIRESTORE_RULES}</pre>
                      <pre className="setup-sql">{STORAGE_RULES}</pre>
                    </>
                  )}
                </li>
              </>
            )}

            <li>
              <b>检查连接</b>
              <small>检查配置信息是否正确，以及安全规则是否已应用。</small>
              <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 6 }}
                disabled={checking} onClick={runCheck}>{checking ? '正在检查…' : '检查连接'}</button>
              {check && <p className={check.ok ? 'setup-ok' : 'setup-err'} style={{ marginTop: 8 }}>{check.message}</p>}
            </li>

            {check?.ok && !check.hasAdmin && !signed && (
              <li>
                <b>创建管理员账号</b>
                <small>此处创建的第一个账号将成为总管理员。登录后会显示主页列表，可在其中创建主页并分发邀请码。</small>
                <label className="k-label">邮箱</label>
                <KInput value={email} onChange={e => setEmail(e.target.value)} />
                <div className="setup-2">
                  <div>
                    <label className="k-label">密码</label>
                    <KInput type="password" value={pw} onChange={e => setPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="k-label">确认密码</label>
                    <KInput type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
                  </div>
                </div>
                <label className="k-label">显示名称（选填）</label>
                <KInput value={nick} onChange={e => setNick(e.target.value)} />
                <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 10 }}
                  disabled={signing} onClick={signUpAdmin}>{signing ? '正在创建…' : '创建管理员账号'}</button>
              </li>
            )}

            {doneStep && (
              <li>
                <b>让访客也能访问</b>
                <small>
                  当前连接<b>仅保存在此浏览器中</b>。选择以下任一方式配置一次后，访客也能连接同一数据库。（这些都是公开配置信息，泄露也安全）
                </small>

                <div className="setup-way">
                  <b>方法 1 — 上传配置文件（推荐）</b>
                  <p>下载配置文件并上传到仓库的 <code>public</code> 文件夹。可直接通过网页操作，无需终端。</p>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={downloadConfig}>① 下载配置文件</button>
                  </div>
                  <label className="k-label">② 输入仓库地址，即可直接打开上传页面</label>
                  <KInput value={repo} onChange={e => setRepo(e.target.value)}
                    placeholder="https://github.com/账号/仓库" />
                  {uploadUrl ? (
                    <div className="setup-row">
                      <a className="btn btn-dark" href={uploadUrl} target="_blank" rel="noreferrer">
                        打开 GitHub 上传页面 ↗
                      </a>
                      <span className="hint" style={{ alignSelf: 'center' }}>
                        将文件拖放到打开的页面中并点击 [Commit changes]，约 1 到 2 分钟后自动生效
                      </span>
                    </div>
                  ) : (
                    repo.trim() && <p className="setup-err">仓库地址格式无效 — https://github.com/账号/仓库</p>
                  )}
                </div>

                <div className="setup-way">
                  <b>方法 2 — Vercel 环境变量</b>
                  <p>将以下内容添加到 Vercel 项目 → Settings → Environment Variables，然后重新部署。</p>
                  <div className="setup-row">
                    <button className="btn btn-ghost" onClick={() => copy(envText(), 'env')}>
                      {copied === 'env' ? '已复制 ✓' : '复制环境变量'}
                    </button>
                  </div>
                  <pre className="setup-sql" style={{ maxHeight: 150 }}>{envText()}</pre>
                </div>
              </li>
            )}

            {doneStep && (
              <li>
                <b>将服务器区域设为首尔（适用于韩国用户）</b>
                <small>
                  Vercel 默认将服务器部署在<b>美国东部</b>，因此页面请求需要跨越太平洋。<b>此设置不会自动更改</b>，请手动调整一次，约需 30 秒。
                </small>
                <ul className="setup-picks">
                  <li>
                    <b>Settings → Functions → Function Region → Seoul (icn1) → 保存</b>
                    <em className="warn">仅保存还不会生效 — 还需进入 Deployments → 最新部署的 ⋯ → Redeploy。</em>
                    <em>验证方法：在主页按 F12 → Network → 最上方请求 → Response Headers 中的 x-vercel-id 以 icn1 开头即表示成功。</em>
                  </li>
                </ul>
              </li>
            )}
          </ol>
        )}

        {signed && <p className="setup-ok">管理员账号已创建。如果启用了邮箱验证，请先完成验证再登录。</p>}
        {err && <p className="setup-err">{err}</p>}

        {doneStep && <button className="btn btn-accent setup-go" onClick={start}>开始使用主页</button>}

        <div className="setup-sep" />
        <label className="k-label">已有备份？</label>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          导入备份 ZIP 后可跳过上述步骤，直接使用备份中的数据。
        </p>
        <input id="setupZip" type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); e.target.value = ''; if (f) restore(f); }} />
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          disabled={busy}
          onClick={() => document.getElementById('setupZip')?.click()}
          {...fileDrop(fl => { const f = fl[0]; if (f) { setFile(f); restore(f); } })}>
          {busy ? '正在恢复…' : file ? file.name : '选择备份 ZIP · 或拖放文件'}
        </button>
      </div>
    </div>
  );
}
