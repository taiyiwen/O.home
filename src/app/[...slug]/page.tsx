'use client';
// 없는 주소 안내 (v1.9) — 개발 마일스톤 문구 제거, 일반 방문자용 안내만
import React from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/ui/PageText';

export default function NotFoundPage() {
  const router = useRouter();
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/">NOT FOUND</PageTitle>
        <p>地址无效或页面已被删除</p>
      </div>
      <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
        <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>
          找不到你访问的页面。
        </p>
        <button className="btn btn-dark" onClick={() => router.push('/')}>返回主页</button>
      </div>
    </section>
  );
}
