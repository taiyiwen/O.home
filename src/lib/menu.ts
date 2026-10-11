// 상단 메뉴 트리 — 기획서 3장 (계층 메뉴, 메뉴 선택제)
// 기본 구성은 프로토타입_2 상단 메뉴를 따름 (기록 그룹 포함 · 커미션은 제거)
// ※ 프로토타입의 「로그인」 gnb 항목은 임시 배치 — 실제로는 우상단 사용자 영역에 표시 (3장 주석)
// TODO(환경설정 메뉴 관리): 관리자가 이 구조를 GUI로 편집 → DB 저장으로 이전
export interface MenuItem {
  label: string;
  href?: string;             // 하위가 없는 단독 메뉴
  children?: { label: string; href: string }[];
}

/** 배치 가능한 기능(모듈) 전체 — href → 기본 이름. 메뉴 트리에 넣어야 노출됨 (3장 메뉴 선택제) */
// 커플홈 — /chars(캐릭터 목록)는 두지 않는다. 캐릭터는 자관 페이지의 멤버 카드에서 연다. 방명록(/guest)도 제거
export const FEATURES: { href: string; label: string }[] = [
  { href: '/rels', label: '角色关系' },
  { href: '/rp', label: '角色互动' },
  { href: '/board', label: '帖子' },
  { href: '/gallery', label: '图集' },
  { href: '/videos', label: '视频' },
  { href: '/loadb', label: '绘图记录' },
  { href: '/tchars', label: 'TRPG角色' },
  { href: '/log', label: 'RP LOG' },    // 로그 백업 — 커플홈에서 이름을 RP LOG로, 주소도 /log 로 (옛 /trpg 는 자동 이동)
  { href: '/dotori', label: '剧本愿望单' },
  { href: '/playlog', label: '游玩记录' },
  { href: '/cal', label: '日历' },
  { href: '/diary', label: '日记' },
  { href: '/threads', label: '讨论串' },
  { href: '/memo', label: '便笺' },
  { href: '/intro', label: '介绍' },
];

export const DEFAULT_MENU: MenuItem[] = [
  {
    label: '角色互动',
    children: [
      { label: '角色关系', href: '/rels' },
      { label: '角色互动', href: '/rp' },
      { label: 'RP LOG', href: '/log' },    // 역극 로그를 올리는 곳이라 역극 옆에 (원래 TRPG 그룹)
    ],
  },
  {
    label: '内容',
    children: [
      { label: '帖子', href: '/board' },
      { label: '图集', href: '/gallery' },
      { label: '视频', href: '/videos' },
      { label: '绘图记录', href: '/loadb' },
    ],
  },
  {
    label: 'TRPG',
    children: [
      { label: '角色', href: '/tchars' },
      { label: '剧本愿望单', href: '/dotori' },
      { label: '游玩记录', href: '/playlog' },
    ],
  },
  {
    label: '记录',
    children: [
      { label: '日历', href: '/cal' },
      { label: '日记', href: '/diary' },
      { label: '讨论串', href: '/threads' },
      { label: '便笺', href: '/memo' },
    ],
  },
];
