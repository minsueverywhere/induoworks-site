# InduoWorks 웹사이트 — 무엇을, 왜, 어떻게

이 문서는 이 프로젝트를 처음부터 다시 이해하고 싶을 때 보는 문서입니다.
"왜 이렇게 만들었는지"와 "배포가 실제로 어떻게 일어나는지"를 설명합니다.

---

## 1. 큰 그림 먼저

전통적인 웹사이트는 보통 이런 구조입니다:

```
방문자 → 서버(항상 켜져 있음) → 데이터베이스 → 서버가 페이지를 조립 → 방문자에게 전송
```

서버가 24시간 켜져 있어야 하고(비용), 방문자가 늘면 서버가 버벅이고(성능),
서버·DB가 공격당할 표면이 넓어집니다(보안).

이 사이트는 다릅니다:

```
방문자 → Cloudflare 전 세계 엣지 서버(캐시된 완성본 HTML) → 방문자에게 즉시 전송
```

**"페이지를 미리 다 구워놓고(prebuild), 전 세계 300여 개 도시에 복사해뒀다가,
방문자가 오면 가장 가까운 곳에서 그냥 파일을 내준다"**는 방식입니다.
이게 "정적 사이트(Static Site)"이고, 목표였던 최소 비용·최대 성능·최대 안정성이
이 구조 자체에서 나옵니다. 서버가 없으니 서버비가 없고, 서버가 없으니 서버가
털릴 일도 없습니다.

유일한 예외가 **문의(Contact) 폼**입니다. 이건 방문자마다 다른 결과(이메일 발송)를
만들어야 하니 정적 파일만으로는 안 됩니다. 그래서 이 부분만 필요한 순간에만
잠깐 실행되는 서버리스 함수(Cloudflare Worker의 API 라우트, `/api/contact`)로
처리합니다. "진짜 서버"가 아니라 요청 하나 처리하고 사라지는 함수라, 관리할 것도
공격받을 것도 거의 없습니다.

> **중간에 방향을 한 번 바꿨습니다**: 처음엔 순수 정적 배포(Cloudflare Pages)로
> 시작했는데, Cloudflare가 Git 연동 시 Astro 프로젝트에 Workers용 어댑터를 자동
> 적용하는 걸 배포 중에 발견했습니다. 그래서 이걸 저장소에 명시적으로 설정해서
> (`@astrojs/cloudflare` 어댑터), 로컬 빌드와 실제 배포가 항상 똑같이 동작하도록
> 맞췄습니다 — 페이지 대부분은 여전히 미리 빌드된 정적 HTML이고, `/api/contact`
> 하나만 요청마다 실행됩니다. URL 끝이 `.pages.dev`가 아니라 `.workers.dev`인
> 이유이기도 합니다.

---

## 2. 무엇을 만들었나 (구성 요소별 설명)

### 2-1. Astro — 페이지를 "미리 굽는" 도구

[Astro](https://astro.build)는 `.astro` 파일(HTML과 비슷한 템플릿)을 가지고
빌드 시점에 완성된 HTML 파일들을 만들어주는 도구입니다. React/Vue 같은 프레임워크와
달리 **브라우저에 JS를 거의 안 보냅니다** — 인터랙션이 필요한 부분(테마 토글, 문의폼)만
작은 스크립트로 남기고, 나머지는 순수 HTML/CSS입니다. 그래서 로딩이 빠릅니다.

`npm run build`를 실행하면 `src/pages/` 안의 파일들이 `dist/client/` 폴더에 완성된
HTML로 변환되고, `/api/contact`처럼 요청마다 실행돼야 하는 부분만 `dist/server/`에
별도로 빌드됩니다. Cloudflare가 이 둘을 합쳐 하나의 Worker로 배포합니다.

### 2-2. Tailwind CSS — 디자인을 코드로

클래스 이름(`text-sm`, `rounded-2xl` 등)으로 스타일을 입히는 방식입니다.
별도 CSS 파일을 계속 늘리지 않아도 되고, 빌드 시점에 실제 쓰인 클래스만
추려서 최종 CSS 용량을 최소화합니다.

### 2-3. 만들어진 페이지들

| 경로 | 역할 | 파일 |
|---|---|---|
| `/` | 홈 — 소개, 대표 프로젝트, 쇼케이스 요약, CTA | `src/pages/index.astro` |
| `/work/` | 프로젝트 목록 | `src/pages/work/index.astro` |
| `/work/[프로젝트]/` | 프로젝트 상세 (목록에 있는 데이터 기반 자동 생성) | `src/pages/work/[slug]/index.astro` |
| `/showcase/` | 기술 쇼케이스 (이 사이트 자체가 예시) | `src/pages/showcase/index.astro` |
| `/careers/` | 모집 공고 | `src/pages/careers/index.astro` |
| `/contact/` | 문의 폼 | `src/pages/contact/index.astro` |
| `/404` | 없는 페이지 | `src/pages/404.astro` |

공통 뼈대(헤더, 푸터, SEO 태그, 다크모드)는 `src/layouts/Layout.astro` 하나가
모든 페이지를 감싸는 방식으로 되어 있어서, 헤더 디자인을 한 번만 고치면
전체 페이지에 반영됩니다.

### 2-4. 콘텐츠는 코드와 분리했다 — `src/config.ts`

프로젝트 목록, 쇼케이스 항목, 모집 공고, 사이트 이름/설명 같은 **실제 텍스트 내용**은
전부 [`src/config.ts`](../src/config.ts) 한 파일에 몰아뒀습니다. 페이지 템플릿(`.astro` 파일)은
"어떻게 보여줄지"만 담당하고, "무슨 내용을 보여줄지"는 이 파일 하나만 고치면 됩니다.
프로젝트 하나 추가하고 싶으면 이 파일의 `projects` 배열에 객체 하나 추가 →
`/work/새프로젝트-slug/` 페이지가 자동으로 생깁니다.

### 2-5. 문의 폼의 실제 흐름

```
방문자가 폼 작성 → 브라우저 JS가 /api/contact 로 전송
                        │
                        ▼
     Cloudflare Worker의 API 라우트 실행 (src/pages/api/contact.ts)
                        │
        1) 봉투 채우기(허니팟) 필드가 채워져 있으면 → 봇으로 간주, 조용히 무시
        2) 이름/이메일/메시지 형식 검증
        3) Turnstile(캡차)로 사람인지 확인
        4) Resend API로 이메일 발송 요청
                        │
                        ▼
              지정된 받는 메일함으로 이메일 도착
```

이 과정에서 **아무 데이터도 저장되지 않습니다** — DB가 없으니 유출될 데이터베이스
자체가 없습니다. API 키 같은 비밀값은 코드에 없고 Cloudflare 대시보드에만
암호화 저장되어 있습니다(자세한 내용은 4장).

---

## 3. 로컬에서 무엇을 설치/설정했나

작업 시작 시점에 이 컴퓨터엔 코드를 실행할 도구가 없어서 아래를 설치했습니다:

- **Node.js** — JS/TS 코드를 로컬에서 실행하고 빌드하기 위한 런타임
- **GitHub CLI(`gh`)** — 이미 설치는 되어 있었고 로그인도 되어 있어서, 터미널에서 바로
  레포지토리를 만들고 푸시할 수 있었습니다
- **npm 패키지들** — `astro`, `tailwindcss`, `@astrojs/sitemap`(검색엔진용 사이트맵
  자동 생성), `@astrojs/cloudflare`(Cloudflare Worker로 빌드해주는 어댑터),
  `wrangler`(Cloudflare 로컬 테스트 도구), `@cloudflare/workers-types`
  (문의폼 함수 코드의 타입 검사용)

---

## 4. 배포 과정 — 코드가 실제 웹사이트가 되기까지

### 4-1. 한 번만 하는 초기 설정 (사용자가 직접 함)

1. **GitHub 레포지토리 생성** — 이건 제가 `gh` CLI로 대신 만들었습니다.
   [github.com/minsueverywhere/induoworks-site](https://github.com/minsueverywhere/induoworks-site)
2. **Cloudflare 프로젝트 생성 & GitHub 연결** — Cloudflare 대시보드(Workers & Pages)에서
   이 저장소를 "지켜보도록" 등록. (이건 로그인이 필요해서 안내만 드리고 직접
   진행하셨거나 진행 중이실 겁니다.)
3. **환경변수(비밀값) 등록** — Resend API 키, Turnstile 키 등을 Cloudflare
   대시보드에 등록. **저장소(GitHub)에는 절대 들어가지 않습니다.**

### 4-2. 이후로는 매번 자동 (git push만 하면 끝)

```
로컬에서 코드 수정
      │
      ▼
git commit → git push origin main
      │
      ▼
GitHub가 Cloudflare에 "코드 바뀜" 알림 (webhook)
      │
      ▼
Cloudflare가 새 코드를 받아서 npm run build 실행
      │
      ▼
dist/ 폴더가 만들어짐 → 전 세계 엣지 서버로 자동 배포
      │
      ▼
몇 초~1분 안에 실제 사이트에 반영 완료
```

즉, 한 번 연결해두면 **저는 코드만 고쳐서 push하면 되고, 배포는 신경 쓸 필요가
없습니다.** 이게 오늘 보낸 "테스트 커밋"이 확인하려던 부분입니다 — push했을 때
Cloudflare가 실제로 반응해서 새 빌드를 돌리는지.

### 4-3. 비밀값은 왜, 어떻게 분리되어 있나

| 값 | 어디 있나 | 왜 |
|---|---|---|
| 사이트 코드 전체 | GitHub (Public) | 브라우저가 어차피 다운로드하는 내용이라 숨길 이유가 없음 |
| `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` 등 | Cloudflare 대시보드 환경변수 (암호화) | 실제로 악용 가능한 값이라 코드와 분리, `.gitignore`로 커밋 자체를 원천 차단 |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare 환경변수(암호화 아님)이지만 결과물엔 공개로 노출됨 | Turnstile 위젯을 브라우저에서 띄우려면 원래 공개되는 값이라 비밀이 아님 |

---

## 5. 이 구조가 "최소 비용"인 이유

- **호스팅**: Cloudflare Workers 무료 티어 (빌드 500회/월, 대역폭 무제한, 전 세계 CDN, 무료 SSL 인증서 포함)
- **문의 폼 발송**: Resend 무료 티어 (월 3,000통)
- **봇 차단**: Cloudflare Turnstile — 무료
- **도메인**: 원하는 커스텀 도메인만 구매하면 되고(연 1만~2만 원대), 그 외엔 전부 $0

트래픽이 웬만큼 늘어도(개인 포트폴리오 규모에서는 사실상 무제한) 비용이 그대로
$0으로 유지되는 구조입니다.

---

## 6. 앞으로 뭔가 바꾸고 싶을 때

| 하고 싶은 것 | 어디를 고치나 |
|---|---|
| 프로젝트/모집공고/문구 수정 | `src/config.ts` |
| 색상·폰트 테마 | `src/styles/global.css` (`:root`, `[data-theme="light"]`) |
| 새 페이지 추가 | `src/pages/` 에 `.astro` 파일 추가 |
| 헤더/푸터 구조 | `src/components/Header.astro`, `Footer.astro` |
| 문의폼 로직 | `src/pages/api/contact.ts` |
| www → 루트 도메인 리다이렉트 | `src/middleware.ts` |
| 보안 헤더 | `public/_headers` |

고친 뒤엔 `git push` 한 번이면 자동으로 반영됩니다(4-2 참고).

---

## 7. 용어가 낯설다면

- **정적 사이트(Static Site)**: 방문할 때마다 새로 만들지 않고, 미리 완성해둔 HTML
  파일을 그대로 내주는 방식.
- **CDN(Content Delivery Network)**: 같은 파일을 전 세계 여러 도시 서버에
  복사해두고, 방문자와 가장 가까운 서버가 응답하게 하는 네트워크. Cloudflare가 이걸 제공.
- **서버리스 함수(Serverless Function)**: 항상 켜져 있는 서버가 아니라, 요청이 올
  때만 잠깐 실행되고 끝나는 코드 조각. 여기선 문의폼 처리에만 씀.
- **환경변수(Environment Variable)**: 코드 밖에 별도로 저장해두는 설정값. 특히
  비밀번호·API 키처럼 코드에 넣으면 안 되는 값을 담는 용도로 많이 씀.
- **빌드(Build)**: 사람이 짠 소스 코드를 브라우저가 바로 읽을 수 있는 최종 HTML/CSS/JS
  파일로 변환하는 과정.

---

관련 문서: [README.md](../README.md)에는 로컬 실행 명령어와 Cloudflare 설정값이
표로 더 간결하게 정리되어 있습니다. 이 문서는 "왜 이렇게 만들었는지"에 초점을 맞춘
설명용이고, README는 "그래서 뭘 어디에 입력하면 되는지" 체크리스트용입니다.
