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
export const localeNames: Record<Locale, string> = { en: 'English', ko: '한국어' };

/** Locale-agnostic base path -> nav label key, in display order. */
export const navItems = [
  { path: '/', key: 'home' },
  { path: '/work/', key: 'work' },
  { path: '/workers/', key: 'workers' },
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
      home: 'Induohood',
      work: 'Works',
      workers: 'Workers',
      showcase: 'Site notes',
      labs: 'Experiments',
      companies: 'Companies',
      careers: 'Careers',
      contact: 'Contact',
    },
    meta: {
      tagline: 'Independent, Together!',
      description:
        'Games, music, artwork, and other projects.',
    },
    home: {
      heading: 'Independent, Together!',
      viewWork: 'View works',
      getInTouch: 'Get in touch',
      featuredWork: 'Games',
      engineeringShowcase: 'About this site',
      seeAll: 'See all',
      hiringHeading: 'Open roles',
      hiringBody:
        'See the careers page for open roles.',
      seeOpenRoles: 'See open roles',
      contact: 'Contact',
      collaborationHeading: 'Contact',
      collaborationBody: 'For questions about the work, use the contact form.',
    },
    work: {
      title: 'Works',
      description: 'Games, music, artwork, and other work by Induo Works.',
      intro: 'Work by Induo Works.',
      categories: 'Work categories',
      games: 'Games',
      music: 'Music',
      artwork: 'Artwork',
      other: 'Other',
      empty: 'No works listed yet.',
    },
    workers: {
      title: 'Workers',
      description: 'People we work with, and their projects.',
      intro: 'People we work with, and their own projects.',
      empty: 'No profiles listed yet.',
      website: 'Website',
      works: 'Their work',
    },
    workDetail: {
      back: '← Works',
      year: 'Year',
      role: 'Role',
      stack: 'Tools',
      viewSource: 'View source →',
      visitProject: 'Open project →',
      viewOnSteam: 'View on Steam →',
      challenge: 'About',
      approach: 'Process',
      outcome: 'Current status',
      gallery: 'Gallery',
      status: 'Status',
      shipped: 'Shipped',
      inProgress: 'In progress',
      paused: 'Paused',
    },
    labs: {
      title: 'Experiments',
      description: 'Small graphics and browser experiments.',
      intro: 'Small tests made during development.',
      open: 'Open experiment →',
    },
    labDetail: {
      back: '← Works',
      experimental: 'Experimental',
    },
    showcase: {
      title: 'About this site',
      description: 'Notes on how this website is built.',
      heading: 'About this site',
      intro: "A few notes about the website.",
    },
    companies: {
      title: 'Companies',
      description: 'Companies under the Induo Works group.',
      heading: 'Induo Works group',
      intro: 'Teams and products operating under Induo Works.',
      visitSite: 'Visit site →',
      empty: 'Nothing listed yet.',
    },
    careers: {
      title: 'Careers',
      description: 'Open roles at Induo Works.',
      introOpen: 'Apply for an open role using the contact form.',
      introClosed: 'We are not hiring at the moment.',
      apply: 'Apply via contact form →',
    },
    contact: {
      title: 'Contact',
      introWithEmail: (email: string) =>
        `Write to ${email} or use the form below.`,
      introNoEmail: 'For questions about our games or other work, use this form.',
      name: 'Name',
      email: 'Email',
      message: 'Message',
      send: 'Send message',
      sending: 'Sending…',
      sentOk: "Your message has been sent.",
      genericError: 'Something went wrong. Please try again.',
      verificationPending: 'Checking your connection…',
      verificationExpired: 'Verification expired. Please complete the check again.',
      verificationError: 'Could not verify your connection. Please refresh and try again.',
      unavailableError: 'Messaging is temporarily unavailable. Please try again later.',
      validationError: 'Check your name, email and message (10–4,000 characters).',
      messageHint: '10–4,000 characters. Include anything you would like us to know.',
      privacyNote: 'Messages are delivered through Resend and are not stored on this site.',
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
      home: 'Induohood',
      work: '작업물',
      workers: '함께하는 사람들',
      showcase: '사이트 정보',
      labs: '실험실',
      companies: '계열사',
      careers: '채용',
      contact: '문의',
    },
    meta: {
      tagline: 'Independent, Together!',
      description: '게임, 음악, 아트워크와 그 외 작업물을 모읍니다.',
    },
    home: {
      heading: 'Independent, Together!',
      viewWork: '작업물 보기',
      getInTouch: '문의하기',
      featuredWork: '게임',
      engineeringShowcase: '사이트 정보',
      seeAll: '전체 보기',
      hiringHeading: '채용',
      hiringBody: '채용 중인 자리는 채용 페이지에서 확인할 수 있습니다.',
      seeOpenRoles: '채용 공고 보기',
      contact: '문의',
      collaborationHeading: '문의',
      collaborationBody: '작업에 관한 질문은 문의 폼으로 보내주세요.',
    },
    work: {
      title: '작업물',
      description: 'Induo Works의 게임, 음악, 아트워크와 그 외 작업물입니다.',
      intro: 'Induo Works의 작업물입니다.',
      categories: '작업물 분류',
      games: '게임',
      music: '음악',
      artwork: '아트워크',
      other: '기타',
      empty: '아직 등록된 작업물이 없습니다.',
    },
    workers: {
      title: '함께하는 사람들',
      description: '함께하는 사람들과 그들의 작업물을 소개합니다.',
      intro: '함께하는 사람들과 각자의 작업물을 소개합니다.',
      empty: '아직 등록된 프로필이 없습니다.',
      website: '웹사이트',
      works: '작업물',
    },
    workDetail: {
      back: '← 작업물 목록',
      year: '연도',
      role: '역할',
      stack: '사용 도구',
      viewSource: '소스 보기 →',
      visitProject: '사이트 보기 →',
      viewOnSteam: 'Steam에서 보기 →',
      challenge: '소개',
      approach: '작업 과정',
      outcome: '현재 상태',
      gallery: '갤러리',
      status: '상태',
      shipped: '출시 완료',
      inProgress: '진행 중',
      paused: '보류',
    },
    labs: {
      title: '실험실',
      description: '그래픽과 브라우저 기능을 시험하는 작은 프로젝트입니다.',
      intro: '개발하면서 시험해 본 것들을 모았습니다.',
      open: '실험 열기 →',
    },
    labDetail: {
      back: '← 작업물 목록',
      experimental: '실험적 기능',
    },
    showcase: {
      title: '사이트 정보',
      description: '이 웹사이트를 만든 방법입니다.',
      heading: '사이트 정보',
      intro: '사이트 구현에 관한 간단한 기록입니다.',
    },
    companies: {
      title: '계열사',
      description: 'Induo Works 그룹에 속한 회사들.',
      heading: 'Induo Works 그룹',
      intro: 'Induo Works 아래에서 운영되는 팀과 제품들입니다.',
      visitSite: '사이트 방문 →',
      empty: '아직 등록된 항목이 없습니다.',
    },
    careers: {
      title: '채용',
      description: 'Induo Works의 채용 중인 포지션.',
      introOpen: '아래 채용 중인 포지션을 확인하세요. 지원은 문의 폼으로 보내주시면 됩니다.',
      introClosed: '현재 채용 중인 자리는 없습니다.',
      apply: '문의 폼으로 지원하기 →',
    },
    contact: {
      title: '문의',
      introWithEmail: (email: string) => `${email} 또는 아래 문의 폼으로 보내주세요.`,
      introNoEmail: '게임이나 다른 작업에 관한 질문을 보내주세요.',
      name: '이름',
      email: '이메일',
      message: '메시지',
      send: '보내기',
      sending: '전송 중…',
      sentOk: '메시지를 보냈습니다.',
      genericError: '문제가 발생했습니다. 다시 시도해주세요.',
      verificationPending: '연결을 확인하고 있습니다…',
      verificationExpired: '확인이 만료됐습니다. 다시 확인해 주세요.',
      verificationError: '연결을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.',
      unavailableError: '지금은 메시지를 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.',
      validationError: '이름, 이메일과 메시지(10–4,000자)를 확인해 주세요.',
      messageHint: '10–4,000자. 함께 이야기하고 싶은 내용을 자유롭게 적어 주세요.',
      privacyNote: '메시지는 Resend를 통해 전달되며 이 사이트에는 저장되지 않습니다.',
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
