/**
 * All UI copy (nav labels, headings, buttons, status messages) in one place,
 * per locale. Page/section content that lives in data (projects, showcase
 * items, companies) is localized separately in src/config.ts, next to the
 * rest of that item's fields.
 *
 * Add a new locale by adding it to `locales` below and filling in a full
 * entry in `ui` — TypeScript will flag anything missing.
 */

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** Locale-agnostic base path -> nav label key, in display order. */
export const navItems = [
  { path: '/', key: 'home' },
  { path: '/work/', key: 'work' },
  { path: '/showcase/', key: 'showcase' },
  { path: '/companies/', key: 'companies' },
  { path: '/careers/', key: 'careers' },
  { path: '/contact/', key: 'contact' },
] as const;

/** Prefix a locale-agnostic root path with the locale segment (default locale is unprefixed). */
export function localizePath(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path;
  return `/${locale}${path}`;
}

/** Strip a leading locale segment off a pathname, returning the locale-agnostic path. */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split('/');
  const maybeLocale = segments[1];
  if ((locales as readonly string[]).includes(maybeLocale)) {
    const rest = '/' + segments.slice(2).join('/');
    return { locale: maybeLocale as Locale, path: rest === '/' ? '/' : rest.replace(/\/?$/, '/') };
  }
  return { locale: defaultLocale, path: pathname };
}

export const ui = {
  en: {
    nav: {
      home: 'Home',
      work: 'Work',
      showcase: 'Showcase',
      companies: 'Companies',
      careers: 'Careers',
      contact: 'Contact',
    },
    meta: {
      tagline: 'Software that earns its keep.',
      description:
        'InduoWorks builds fast, reliable web software — portfolio, engineering showcase, and open roles.',
    },
    home: {
      heading: 'Building fast, reliable software — and showing the work.',
      viewWork: 'View work',
      getInTouch: 'Get in touch',
      featuredWork: 'Featured work',
      engineeringShowcase: 'Engineering showcase',
      seeAll: 'See all',
      hiringHeading: 'Hiring, or want to talk shop?',
      hiringBody:
        'Open roles are listed on the careers page. For anything else, the contact form reaches me directly.',
      seeOpenRoles: 'See open roles',
      contact: 'Contact',
    },
    work: {
      title: 'Work',
      description: 'Selected projects and case studies.',
      intro: 'Selected projects, with what shipped and why.',
    },
    workDetail: {
      back: '← Work',
      year: 'Year',
      role: 'Role',
      stack: 'Stack',
      viewSource: 'View source →',
    },
    showcase: {
      title: 'Showcase',
      description: 'How this site is built: performance, accessibility, and security choices.',
      heading: 'Engineering showcase',
      intro: "This site is itself a demo — every choice below is live on the page you're reading.",
    },
    companies: {
      title: 'Companies',
      description: 'Companies under the InduoWorks group.',
      heading: 'InduoWorks group',
      intro: 'Teams and products operating under InduoWorks.',
      visitSite: 'Visit site →',
    },
    careers: {
      title: 'Careers',
      description: 'Open roles at InduoWorks.',
      introOpen: 'Open roles below. Reach out via the contact form to apply.',
      introClosed: 'No open roles right now — check back soon.',
      apply: 'Apply via contact form →',
    },
    contact: {
      title: 'Contact',
      introWithEmail: (email: string) =>
        `Prefer email? Write to ${email}. Otherwise, the form below reaches me directly.`,
      introNoEmail: 'Send a message below — it goes straight to me, no account or signup needed.',
      name: 'Name',
      email: 'Email',
      message: 'Message',
      send: 'Send message',
      sending: 'Sending…',
      sentOk: "Sent — thanks, I'll get back to you soon.",
      genericError: 'Something went wrong. Please try again.',
    },
    notFound: {
      eyebrow: '404',
      title: 'Page not found',
      body: "The page you're looking for doesn't exist or moved.",
      back: 'Back to home',
    },
    footer: {
      rights: 'All rights reserved.',
    },
    misc: {
      skipToContent: 'Skip to content',
      toggleTheme: 'Toggle color theme',
      toggleMenu: 'Toggle menu',
      switchLangLabel: '한국어로 보기',
      switchLangShort: '한국어',
    },
  },
  ko: {
    nav: {
      home: '홈',
      work: '작업',
      showcase: '쇼케이스',
      companies: '계열사',
      careers: '채용',
      contact: '문의',
    },
    meta: {
      tagline: '제 몫을 하는 소프트웨어.',
      description: 'InduoWorks는 빠르고 안정적인 웹 소프트웨어를 만듭니다 — 포트폴리오, 엔지니어링 쇼케이스, 채용 정보.',
    },
    home: {
      heading: '빠르고 신뢰할 수 있는 소프트웨어를 만들고, 그 과정을 보여줍니다.',
      viewWork: '작업 보기',
      getInTouch: '문의하기',
      featuredWork: '주요 프로젝트',
      engineeringShowcase: '엔지니어링 쇼케이스',
      seeAll: '전체 보기',
      hiringHeading: '채용 중이거나, 편하게 이야기 나누고 싶으신가요?',
      hiringBody: '채용 중인 포지션은 채용 페이지에서 확인하실 수 있습니다. 그 외 문의는 아래 문의 폼으로 바로 전달됩니다.',
      seeOpenRoles: '채용 공고 보기',
      contact: '문의',
    },
    work: {
      title: '작업',
      description: '주요 프로젝트와 사례.',
      intro: '진행한 프로젝트와, 무엇을 왜 만들었는지 정리했습니다.',
    },
    workDetail: {
      back: '← 작업 목록',
      year: '연도',
      role: '역할',
      stack: '기술 스택',
      viewSource: '소스 보기 →',
    },
    showcase: {
      title: '쇼케이스',
      description: '이 사이트가 만들어진 방식 — 성능, 접근성, 보안 선택들.',
      heading: '엔지니어링 쇼케이스',
      intro: '이 사이트 자체가 데모입니다 — 아래 항목 모두 지금 보고 계신 페이지에 그대로 적용되어 있습니다.',
    },
    companies: {
      title: '계열사',
      description: 'InduoWorks 그룹에 속한 회사들.',
      heading: 'InduoWorks 그룹',
      intro: 'InduoWorks 아래에서 운영되는 팀과 제품들입니다.',
      visitSite: '사이트 방문 →',
    },
    careers: {
      title: '채용',
      description: 'InduoWorks의 채용 중인 포지션.',
      introOpen: '아래 채용 중인 포지션을 확인하세요. 지원은 문의 폼으로 보내주시면 됩니다.',
      introClosed: '현재 채용 중인 포지션이 없습니다 — 나중에 다시 확인해주세요.',
      apply: '문의 폼으로 지원하기 →',
    },
    contact: {
      title: '문의',
      introWithEmail: (email: string) => `이메일이 편하시면 ${email}로 보내주세요. 아니면 아래 폼으로도 바로 전달됩니다.`,
      introNoEmail: '아래에 메시지를 남겨주세요 — 계정이나 가입 없이 바로 전달됩니다.',
      name: '이름',
      email: '이메일',
      message: '메시지',
      send: '보내기',
      sending: '전송 중…',
      sentOk: '전송 완료 — 곧 답변드리겠습니다.',
      genericError: '문제가 발생했습니다. 다시 시도해주세요.',
    },
    notFound: {
      eyebrow: '404',
      title: '페이지를 찾을 수 없습니다',
      body: '찾으시는 페이지가 없거나 이동되었습니다.',
      back: '홈으로 돌아가기',
    },
    footer: {
      rights: 'All rights reserved.',
    },
    misc: {
      skipToContent: '본문으로 건너뛰기',
      toggleTheme: '테마 전환',
      toggleMenu: '메뉴 전환',
      switchLangLabel: 'View in English',
      switchLangShort: 'English',
    },
  },
} as const;

export function t(locale: Locale) {
  return ui[locale];
}
