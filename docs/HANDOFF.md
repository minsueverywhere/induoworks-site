# 작업 인계 노트

다음 작업을 이어갈 때 읽는 문서다. 콘텐츠 편집 방법은 [CONTENT.md](CONTENT.md), 구조 설명은 [PROJECT-GUIDE.md](PROJECT-GUIDE.md)를 본다.

## 2026-10-16 변경 사항

### 보안·빌드 (`b03d95b`–`4cec227`)
- 문의 API: Turnstile 비밀키가 없으면 검증을 건너뛰지 않고 503으로 거부한다. 빌드할 때 `PUBLIC_TURNSTILE_SITE_KEY`가 없으면 빌드가 실패한다.
- 이미지: 어댑터를 `imageService: 'compile'`로 바꿨다. 런타임 `/_image`는 같은 사이트의 원본만 그대로 전달하고, Cloudflare Images 변환 비용이 나가지 않는다.
- `_headers`: 고정 캐시를 해시가 붙은 `/_astro/*`에만 적용한다.
- 의존성: astro 7.4.0, @astrojs/cloudflare 14.4.0으로 올렸다. 취약점 0개.
- `npm run build`가 테스트, 타입 검사, 빌드, CSP 해시 생성, 빌드 검증을 한 번에 실행한다.
- 문의 메일 앱 별칭 옵션을 추가했다 (`0a09fbc`).

### Induovile 마을 (`e9804c4`–`b7bf3d1`, 그 이후는 아직 커밋 전)
- 마을 높이를 화면에 맞추고 공통 페이지 레이아웃을 단순화했다.
- 선택형 실습 튜토리얼을 추가했다. 순서는 **패닝 → 확대·축소 → Induo Works 입장 → 주크박스 재생 → 마을로 나오기**이고, 단계 목록은 `src/scripts/village-tutorial.mjs`에 있다.
- 튜토리얼 안내 표시는 이모지 대신 맵 색(윤곽 `#776655`, Dewy Sand `#EDCBA9`)을 쓴 CSS 선·화살표·원이다.
- 마우스오버 외곽선과 튜토리얼 강조는 Dewy Sand(`#EDCBA9`, 브랜드 manifest 기준)다.
- Induo Works 허브를 언덕 위로 옮기고, 간판을 집 벽면에 붙여 집과 함께 선택되게 했다. Frondward는 오른쪽으로 두 칸, 공고판은 위로 한 칸 옮겼다.
- 주크박스는 GRENCH BOSS의 **Sunlit Circuit**을 반복 재생한다.
  - 원본: `F:\music-projects\projects\Grench Boss\Sunlit Circuit\Sunlit Circuit.wav` (64초, 48kHz 24bit, SHA-256 `930fee2b…`)
  - 웹용 파일: `public/village/music/sunlit-circuit-930fee2b274e.ogg` (Opus 64k, 약 640KB)와 `.mp3` (96k, Opus를 못 쓰는 브라우저용)
  - 반복용으로 맞춘 원본이라 **페이드를 넣지 않았다.** MP3는 인코더 특성상 반복 경계에 아주 짧은 틈이 생길 수 있다.
  - 주크박스를 누를 때만 파일을 요청한다 (`src/scripts/village-music.mjs`). 씬 로딩에는 영향이 없다.
  - 처음 재생하면 씬 오른쪽 위에 캡션·배율 표시와 같은 작은 고정폭 글씨로 곡 정보가 뜨고(평소 반투명, 마우스를 올리면 진하게), 누르면 일시정지와 재생이 바뀐다. 씬 밖의 정지 버튼과 상태 문구는 레이아웃을 밀어내서 없앴다.
  - 다시 인코딩할 때는 같은 옵션으로 `ffmpeg -i <wav> -map_metadata -1 -c:a libopus -b:a 64k -application audio <out>.ogg`를 실행한다. 원본이 바뀌면 파일명의 해시와 `src/village-music.ts`도 함께 바꾼다.
- 소셜 채널은 Induo Works 작업실 벽면에 아이콘을 하나씩 붙여 직접 링크로 전시한다. 아이콘 이미지는 작업실에 들어갈 때 불러온다.

### 그 밖의 페이지
- Home을 Induovile로 이름을 바꿨다. Works는 갤러리·모자이크·게시글 보기와 검색·필터를 지원하고, Workers에 Frondward를 등록했다. 제작자와 작품 소속은 `src/config.ts` 한 곳에서 관리한다.

## 보류한 작업

### 로컬 편집 모드
- 목적: 화면에서 격자를 켜고 집·간판·나무·공고판을 드래그해 위치와 크기를 맞춘 뒤 저장한다. 지금은 좌표를 코드에서 숫자로 고쳐야 해서 세밀한 조정이 어렵다.
- 결론: **외부 데이터 분리 없이 만들 수 있다.** 편집 결과를 저장소의 데이터 파일(예: 배치 JSON)에 쓰고 평소처럼 빌드·배포하면 된다. 편집 모드는 `npm run dev`에서만 켜지게 하고, 공개 빌드에는 포함하지 않는다.
- 최소 범위: 격자 표시, 오브젝트 드래그, 위치·크기 조절, 저장. 집·나무의 외형은 도형 코드로 그리므로 외형 편집은 별도 도구가 필요하다.
- 시작점: 좌표는 `src/scripts/village-layout.mjs`, `src/config.ts`의 `worker.house`, `src/components/Village.astro`의 배치 목록에 흩어져 있다. 먼저 이 좌표를 데이터 파일 하나로 모으는 것이 첫 단계다.

### 런타임 데이터 분리 (R2)
- 모든 내용은 [보류 이슈 #2](https://github.com/minsueverywhere/induoworks-site/issues/2)에서만 관리한다.
- 요약: 화면은 정적으로 두고, 업체·작품·배치 목록과 이미지·음악을 R2 같은 별도 저장소에서 읽으면 콘텐츠를 재빌드 없이 바꿀 수 있다. 대신 데이터 검증, 캐시, 조회 실패 시 대체 화면, 수정 권한, 정적 상세 페이지 동기화를 따로 챙겨야 한다.
- 로컬 편집 모드에는 필요하지 않다. 공개 사이트에서 바로 수정하는 관리 화면이 필요해질 때 다시 검토한다.

## 확인하지 못한 것
- 실제 휴대폰에서의 터치 조작(패닝·핀치·튜토리얼)
- 문의 메일이 실제로 수신함에 도착하는지
- Safari에서 MP3로 재생할 때 반복 경계가 매끄러운지
