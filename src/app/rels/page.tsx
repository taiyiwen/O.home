'use client';
// 자관 (커플홈) — 목록 페이지를 두지 않는다. 메뉴의 「자관」은 대표 자관(저장 순서 첫 번째) 상세로 바로 간다.
// 자관이 여럿이면 상세 좌상단의 전환 칩으로 오간다.
// 아직 자관이 없으면 관리자에게 시작 안내(내 캐릭터 만들기 → 자관 만들기)를 보여 준다.
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Relation, REL_SEED, Character, CHAR_SEED, relPath, charPath, openableRels } from '@/lib/charStore';
import { PageTitle } from '@/components/ui/PageText';

export default function RelsPage() {
  const router = useRouter();
  const { user, isAdmin, ready } = useAuth();
  const [rels, , loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const main = openableRels(rels, { isAdmin, loggedIn: !!user })[0];

  useEffect(() => {
    if (loaded && ready && main) router.replace(relPath(main));
  }, [loaded, ready, main, router]);

  if (!loaded || !ready || main) return <section className="page" />;

  if (!isAdmin) {
    // 멤버공개 자관만 있는데 로그인 전이면 — 없는 게 아니라 잠겨 있는 것
    const locked = !user && rels.some(r => r.visibility === 'member');
    return (
      <section className="page">
        <div className="page-head">
          <PageTitle>角色关系</PageTitle>
          <p>{locked ? '仅成员可见 — 登录后即可查看' : '暂无公开的角色关系'}</p>
        </div>
      </section>
    );
  }

  const mine = chars.filter(c => c.own);
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>角色关系</PageTitle>
        <p>暂无角色关系，请创建主页的核心角色关系。</p>
      </div>
      <div className="panel" style={{ maxWidth: 560, margin: '0 auto', padding: 26, display: 'grid', gap: 20 }}>
        <div>
          <label className="k-label" style={{ marginBottom: 8 }}>1. 我的角色</label>
          {mine.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {mine.map(c => (
                <span key={c.id} className="pill" style={{ cursor: 'var(--cur-pointer,pointer)' }}
                  onClick={() => router.push(charPath(c))}>
                  <i style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    background: c.color, marginRight: 6, verticalAlign: 'middle',
                  }} />
                  {c.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 0 }}>请先创建要关联到角色关系的角色</p>
          )}
          <button className="btn btn-ghost" onClick={() => router.push('/chars/new?next=/rels')}>＋ 创建角色</button>
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 8 }}>2. 角色关系</label>
          <p className="hint" style={{ marginTop: 0 }}>
            选择自己的角色创建角色关系。对方角色创建后，可在角色关系页面中点击“＋ 添加成员”将其加入。
          </p>
          <button className="btn btn-dark" onClick={() => router.push('/rels/new')}>＋ 创建角色关系</button>
        </div>
      </div>
    </section>
  );
}
