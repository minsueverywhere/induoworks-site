# 씬 내부 편집·Discord 참여자 작성본

2026-10-17 사용자가 Discord 로그인·서버 권한 구현 보류를 해제했다. 마을 외관은 호스트가 관리하고, 승인된 Discord 계정은 자기 업체의 작품과 집 내부만 편집한다. **현재는 로컬 코드·검증 단계**이며 운영 D1 연결·Discord 비밀 설정·실제 계정 검증·사이트 코드 배포는 별도로 완료해야 한다. 요구사항과 실제 진행 상태는 [이슈 #2](https://github.com/minsueverywhere/induoworks-site/issues/2), 호스트 로컬 도구는 [CONTENT.md](CONTENT.md)를 따른다.

## 현재 구현 계약

- 공개 홈의 ‘내 작업실’을 누를 때 참여자 UI/CSS를 동적으로 읽는다. 평소에는 로그인·편집 코드나 음원을 초기 로딩하지 않는다.
- Discord `identify` authorization code flow, 브라우저에 묶인 10분·일회성 state, 서버에서 토큰 교환과 사용자 조회, 7일 세션을 사용한다. Discord 토큰은 저장하지 않는다. 세션 원문은 Secure·HttpOnly·SameSite=Lax·__Host 쿠키, 해시는 D1에 둔다.
- `studio_members`의 Discord ID → 업체 ID를 매 요청에 확인한다. 공개 JSON에는 계정 ID·권한·작성본·요청을 넣지 않는다. 별도 `studio_hosts`에 등록한 계정만 전체 요청을 검토한다. 호스트 ID도 공개 설정이나 Git에 두지 않는다.
- 참여자는 자기 업체만 소속된 Work·이미지·음악 데이터와 `workers[].room` 사본을 수정한다. 공유 제작 작품과 다른 업체 데이터, 집 외부 위치, 마을 지형·공지, 권한 연결을 변경할 수 없다. 내 집 선택·씬 편집·실행 취소·작성본 저장·변경 요청을 제공한다.
- **새 파일은 호스트가 등록**하기로 사용자가 선택했다. 참여자는 이미 승인된 파일만 선택한다. 서버도 새로운 파일 경로/외부 미디어 URL을 거부한다. R2·참여자 직접 파일 업로드는 도입하지 않는다.
- `studio_drafts`는 계정/업체별 비공개 작성본과 증가하는 revision을 저장한다. 공개 승인본의 자기 업체 데이터 해시를 비교하며, 오래된 승인본·다른 창 저장을 409로 거부한다. 오래된 작성본은 JSON으로 내려받아 수동 비교한다.
- `studio_proposals`는 제출 당시 사본을 고정한다. 이유 1–1,000자, 요청 본문 256KiB, 계정별 미결 요청 5개, 동일 내용 중복 제출 거부, Cloudflare 요청 제한 30회/60초를 사용한다. 제출은 공개 콘텐츠를 바꾸지 않는다.
- 호스트는 요청 JSON을 내려받아 로컬 편집기의 ‘변경안 가져오기’로 연다. 기준 해시·소속·형식·참조·충돌·파일 검증 뒤 미리 보고 기존 저장/백업/콘텐츠 배포를 사용한다. 발행 결과 확인 API는 실제 공개 콘텐츠가 요청 내용과 일치할 때만 published로 바꾼다. 반려도 호스트만 가능하다. API에 Cloudflare 배포 키를 주지 않는다.
- `/api/studio/login`, `callback`, `session`, `logout`, `draft`, `submit`, `proposals`, `proposal`, `reject`, `published`는 동적 서버 경로다. DB/비밀/요청 제한 미설정은 503으로 닫힌다. 쓰기는 정규 출처 `https://induo.works`·JSON 요청만 받으며 로컬 인증 우회 기능은 없다.

## 운영 연결에 필요한 설정

아래는 아직 운영 실행 완료 기록이 아니다. 기존 앱 ID는 사용자가 재사용 방향으로 논의한 `1469603219695992895`다.

1. 사용자 승인으로 기존 Wrangler 권한을 유지하고 D1 쓰기만 추가한 재로그인을 완료했다. 다른 제품의 전체 권한을 일괄 추가하지 않았다.
2. 전용 D1 `induoworks-studio`(APAC)를 생성하고 `wrangler.jsonc`에 `STUDIO_DB` 바인딩과 실제 DB ID를 기록했다. `migrations/0001_studio.sql`, `0002_studio_hosts.sql`은 로컬·원격 모두 적용했다. 현재 운영 사이트 코드에는 아직 배포하지 않았다.
3. Discord Developer Portal → 기존 앱 → OAuth2 → Redirects에 `https://induo.works/api/studio/callback`을 등록·저장했다. `identify`만 사용하며 봇 권한을 추가하지 않았다.
4. `DISCORD_CLIENT_ID`는 Wrangler vars에 등록했다. Cloudflare Workers & Pages → induoworks-site → Settings → Variables and Secrets에 `DISCORD_CLIENT_SECRET`(Secret)을 등록한다. 사용자가 직접 새로 발급해 등록을 완료했고, 비밀 값은 읽지 않고 이름 존재만 확인했다. 비밀을 채팅·이슈·Git에 넣지 않는다. Client Secret 생성/재설정·입력은 사용자가 직접 수행한다.
5. 사용자가 제공한 본인 Discord ID를 원격 DB의 `studio_hosts`와 `studio_members`의 Frondward에 연결했다. 이후 참여자는 관리자가 확인한 Discord 계정 ID와 기존 업체 ID를 `studio_members(user_id,worker_id)`에 연결한다. ID는 사용자명/닉네임이 아니라 Discord의 숫자 ID다. 브라우저 작성본으로 권한을 등록할 수 없다.
6. 별도 승인된 코드 배포 후 실제 계정 두 개로 자기 집·타인 집·권한 회수·저장·변경 요청·호스트 검토/발행과 모바일 조작을 확인한다. 설정 전 기능이 활성화된 것으로 안내하지 않는다.

D1 설정 예시(실제 ID를 사용해야 하며 예시 ID를 운영 설정에 넣지 않는다):

```json
{"d1_databases":[{"binding":"STUDIO_DB","database_name":"induoworks-studio","database_id":"실제 데이터베이스 ID","migrations_dir":"migrations"}]}
```

## 검증과 남은 범위

Node SQLite 기반 테스트로 실제 SQL, state 위조·재사용, 세션 만료, 계정 소속/권한 회수, CSRF, 요청 제한, 타사 작품 ID·소속 변경, 새 파일 거부, 작성본 동시 저장, 중복 제출, 오래된 승인본, 공개 콘텐츠 불일치 시 발행 성공 거부를 확인한다. 로컬 씬 꾸미기와 공개 참여자 UI의 실제 계정 검증은 구분한다.

계단·캐릭터 이동, 참여자 직접 업로드/R2, 공동 제작 작품의 편집 정책, 권한 관리 GUI, 원격 자동 발행은 포함하지 않는다. 현재 기본 자동 전시의 작품 9개·이미지 4개 한도는 유지한다. 프로젝트 정적 상세/SEO 갱신은 사이트 재빌드 대상이지만 범용 상세와 Works·씬의 데이터 변경은 콘텐츠 발행만 필요하다.

인증 근거: [Discord 공식 OAuth2 문서](https://docs.discord.com/developers/topics/oauth2).
