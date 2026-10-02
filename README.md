## cloud Server

### 인증 서버 연결

`.env`의 `AUTH_URL`은 프로토콜을 포함한 주소여야 합니다.
예: 로컬 개발 `http://localhost:3000`, HTTPS 배포 `https://auth.example.com`.
설정 변경 후 개발 서버를 재시작하세요.

`WEB_URL`은 브라우저에서 접속하는 Cloud 주소를 프로토콜과 포트까지 포함해 설정합니다.
예: `http://web.example.com:3001`. `AUTH_URL`은 별도의 로그인 서버 주소입니다.
파일 수정·로그아웃 요청의 Origin은 공개 Host 또는 `WEB_URL`과 정확히 일치해야 합니다.
HTTPS 프록시 뒤에서 내부 주소가 localhost로 보이는 경우 `WEB_URL`에 외부 HTTPS 주소를 설정하세요.
포트 3001과 3002는 서로 다른 Origin이며, 로그인 서버 Origin을 파일 수정용으로 허용하지 않습니다.

브라우저는 같은 출처의 `/api/user`, `/api/logout`을 호출하고,
이 서버가 `AUTH_URL`의 해당 API로 `session_id` 쿠키만 전달합니다.
사용자 응답은 캐시하지 않습니다. 브라우저에서 인증 서버로 직접 요청하지 않으므로
이 조회 경로에는 CORS 설정이 필요 없습니다.

이 방식은 **Cloud 도메인에 session_id 쿠키가 전달되는 경우**에 동작합니다.
인증 서버만의 host-only 쿠키는 Cloud 서버에서 읽을 수 없습니다.
같은 부모 도메인의 서비스라면 인증 서버에서 `Domain=example.com; Path=/; HttpOnly; Secure; SameSite=Lax`
형태로 필요한 하위 도메인에 공유할 수 있습니다. 기존 쿠키는 설정 변경 후 재로그인이 필요합니다.
부모 도메인 전체에 공유되는 세션 쿠키이므로 관련 하위 도메인이 모두 신뢰 가능해야 합니다.
로컬에서는 두 앱 모두 `localhost`로 접속하세요. `127.0.0.1`과 섞어 쓰지 마세요.
서로 다른 부모 도메인인 경우 쿠키를 공유할 수 없고, 인증 콜백에서 Cloud 전용 세션을 만드는 흐름이 필요합니다.

`/api/user`가 `401 NO_SESSION`을 반환하면 Cloud로 쿠키가 오지 않는 상태이고,
`401 INVALID_SESSION`이면 쿠키는 전달됐지만 인증 서버에서 유효하지 않은 상태입니다.
`503 AUTH_URL_INVALID`는 주소 설정 오류, `502 AUTH_UNAVAILABLE`은 연결 오류입니다.
원래 인증 쿠키의 Domain/Path를 그대로 유지한 Set-Cookie 응답을 전달합니다.
로그인·회원가입·계정 설정은 인증 서버에서 처리합니다.

### Cloud API

모든 파일·폴더 요청은 `lib/cloud.ts`의 `getCloudOwnerId(request)`에서 세션을 검증합니다.
요청의 `session_id`를 인증 서버 `/api/user`에 전달하고 성공 응답의 `result.id`를 소유자로 사용합니다.
인증 서버의 `null` 또는 `{ "result": null }` 응답과 쿠키 누락·만료는 `401`로 처리합니다.
인증 서버 연결·응답 오류는 `502` 또는 설정 오류 `503`이며 임시 ID로 대체하지 않습니다.
클라이언트가 보내는 사용자 ID와 프로필 정보는 소유자 결정에 사용하지 않습니다.
공유 권한이 없는 다른 사용자의 항목 접근은 `404`로 거절합니다.
공유받은 항목은 보기·편집 권한에 따라 접근하며 공유 관리·이동·삭제는 소유자만 가능합니다.
기존 `temporary-cloud-user` 데이터는 자동으로 실제 계정에 이전되지 않습니다.
공유 기능에는 아래의 추가 공유 테이블 SQL이 필요합니다. 이미 적용한 SQL은 재실행하지 않습니다.
드라이브 UI는 실제 API로 목록 조회·업로드·폴더 생성·이름 변경·즐겨찾기·삭제·복원·다운로드를 처리합니다.
파일·폴더 ID는 서버에서만 생성하고 새로고침 후에도 파일이 유지됩니다.

파일 정보는 PostgreSQL `cloud_item` 테이블에, 원본은 프로젝트의 `.cloud-storage/`에 저장됩니다.
원본 저장 폴더는 `public` 외부에 있으며 API를 통해서만 다운로드합니다.
서버 재시작 후에도 데이터가 유지됩니다. 배포할 때는 DB와 이 폴더를 함께 백업하고,
지속 가능한 디스크를 연결하세요. 현재는 단일 서버용 저장 방식입니다.

새 환경 설정:

```sh
# .env에 DATABASE_URL 설정 후, 기존 auth 테이블을 변경하지 않는 추가 SQL 실행 (최초 1회)
npx prisma db execute --file prisma/cloud-schema.sql
npx prisma db execute --file prisma/cloud-sharing.sql
npx prisma generate
npm run dev
```

이미 cloud 테이블을 만든 환경에서는 SQL을 다시 실행하지 않습니다.
DB 없이 API를 호출하면 `503 STORAGE_UNAVAILABLE`을 반환합니다.

| Method | URL | 기능 |
| --- | --- | --- |
| GET | `/api/files` | 현재 폴더의 내 파일 목록 |
| POST | `/api/files` | 파일 하나 업로드 |
| GET | `/api/files/:id` | 파일 정보 |
| PATCH | `/api/files/:id` | 이름 변경, 폴더 이동, 즐겨찾기, 복원 |
| DELETE | `/api/files/:id` | 파일을 휴지통으로 이동 |
| DELETE | `/api/files/:id?permanent=true` | 휴지통 파일과 원본 완전 삭제 |
| GET | `/api/files/:id/content` | 원본 다운로드 |
| GET | `/api/folders` | 현재 폴더의 내 폴더 목록 |
| POST | `/api/folders` | 폴더 생성 |
| GET | `/api/folders/:id` | 폴더 정보 |
| PATCH | `/api/folders/:id` | 이름 변경, 이동, 즐겨찾기, 복원 |
| DELETE | `/api/folders/:id` | 빈 폴더를 휴지통으로 이동 |
| DELETE | `/api/folders/:id?permanent=true` | 휴지통의 빈 폴더 완전 삭제 |

목록 쿼리: `parentId` (없으면 루트), `q` (이름 검색), `starred=true`,
`trash=true` (전체 휴지통), `limit` (기본 50, 최대 100), `offset` (기본 0).
`scope=all`은 로그인한 사용자의 전체 폴더에 있는 항목을 조회합니다. UI는 페이지별로 조회해 전체 목록을 구성합니다.
`/api/files/:id/content?preview=true`는 PNG/JPEG/GIF/WebP/AVIF만 이미지로 반환하며 그 외 파일은 다운로드 처리합니다.
응답은 `{ items, total, limit, offset }`입니다. 항목의 `size`는 바이트 단위입니다.
생성·수정·단건 조회는 `{ item }`, 삭제 성공은 본문 없는 `204`를 반환합니다.
항목 ID와 저장소 파일명은 서버에서 생성합니다.

드라이브 UI의 **새로 만들기** 메뉴에서 새 폴더 생성과 파일 업로드를 선택할 수 있습니다.
폴더와 파일은 하나의 목록 또는 격자에 표시하며, 폴더를 먼저 정렬합니다.
카테고리 드롭다운에서 전체 항목, 폴더, 3D 파일, 이미지, 기타 파일을 선택할 수 있습니다.
같은 줄 오른쪽의 정렬 메뉴에서 최근 수정순(최신 먼저), 이름순, 파일 크기순(큰 파일 먼저)을 선택합니다.
정렬 시 폴더가 먼저 표시되며 목록·격자 보기 모두 같은 순서를 사용합니다.
현재 열린 폴더에 저장되며, 제목에 표시된 각 폴더 경로를 눌러 탐색합니다.
파일·폴더의 옵션 창에서 **이동**을 누르고 대상 폴더를 탐색한 뒤 **여기로 이동**을 선택하세요.
목록·격자의 **…** 드롭다운에서 정보 보기, 이름 바꾸기, 파일 다운로드를 선택합니다.
정보 보기와 이름 바꾸기는 별도 창으로 열립니다. 일반 폴더에는 다운로드 메뉴가 표시되지 않습니다.
휴지통 항목에는 정보 보기·복원·완전 삭제만 표시합니다. 완전 삭제는 확인 후 실행하며 복원할 수 없습니다.
내 드라이브 루트로도 이동할 수 있습니다. 폴더 자체나 그 하위 폴더는 이동 대상으로 제외하며,
서버에서도 소유권, 순환 구조, 같은 이름 충돌을 검증합니다.
목록·격자에서 파일이나 폴더를 다른 폴더로 끌어놓아 이동할 수도 있습니다.
상단 경로의 상위 폴더·내 드라이브, 사이드바 내 드라이브도 이동 대상입니다.
유효한 대상은 파란색으로 강조되며 현재 위치·자기 자신·하위 폴더로의 드롭은 무시합니다.
컴퓨터에서 끌어온 파일은 기존처럼 현재 열린 폴더에 업로드됩니다.

### 사용자 공유

파일·폴더의 **… → 공유**에서 핸들을 입력하고 보기/편집 권한을 선택해 사용자를 추가합니다.
세 명 이상도 제한 없이 한 사람씩 추가하며 각자의 권한 변경과 공유 해제가 가능합니다.
같은 사용자를 중복 추가하면 `409 ALREADY_SHARED`입니다. 수신자는 **공유된 파일**에서 확인합니다.
알림 메일이나 메시지를 전송하지 않으며 등록된 계정에 접근 권한을 직접 부여합니다.

Cloud는 `AUTH_URL`의 `POST /api/user/handle`로 `{ "handle": "cloud" }`를 보내며
`session_id`만 전달합니다. 응답은 `{ "result": { "id": "...", "handle": "cloud", "displayName": "..." } }`
형식을 사용합니다. 반환된 사용자 ID로 공유하며 클라이언트의 임의 사용자 ID는 공유 생성에 사용하지 않습니다.
`role`, `bio`, `avatarUrl` 등 조회 응답의 추가 필드는 저장하지 않습니다.
Cloud DB에 인증 사용자의 테이블이나 비밀번호를 복제하지 않습니다.

| 권한 | 허용 작업 |
| --- | --- |
| 보기 | 공유된 파일·폴더 조회, 파일 다운로드·이미지 미리보기 |
| 편집 | 보기 기능 + 이름 변경, 공유 폴더 안에 업로드·폴더 생성 |
| 소유자 | 전체 관리, 공유 대상·권한 관리, 이동, 삭제·복원·완전 삭제 |

편집자가 공유 폴더에 추가한 항목은 폴더 소유자의 저장소와 용량에 속합니다.
폴더 공유는 현재·미래 하위 항목에 상속됩니다. 상속된 권한은 공유 창에 별도로 표시하며
상위 폴더에서 변경합니다. 직접 공유를 해제해도 상위 폴더의 권한이 있으면 접근할 수 있습니다.
여러 공유 경로가 있으면 더 높은 권한이 적용됩니다. 폴더 밖으로 옮기면 해당 폴더의 상속 권한은 사라집니다.
휴지통 항목은 수신자에게 보이지 않으며 복원 시 남아 있는 공유가 다시 적용됩니다.
완전 삭제 시 해당 항목의 공유 기록도 함께 삭제됩니다. 권한은 매 요청마다 다시 검증합니다.

기존 DB에는 최초 한 번 다음 추가 SQL과 클라이언트 생성을 실행하세요.
이번 작업의 현재 로컬 Cloud DB에는 이미 적용했습니다.

```sh
npx prisma db execute --file prisma/cloud-sharing.sql
npx prisma generate
```

| Method | URL | 기능 |
| --- | --- | --- |
| GET | `/api/shared?limit=100&offset=0` | 공유받은 항목과 접근 가능한 하위 항목 |
| GET | `/api/shares?itemId=...` | 소유자의 직접·상속 공유 목록 |
| POST | `/api/shares` | `{ itemId, handle, role: "VIEWER" 또는 "EDITOR" }`로 추가 |
| PATCH | `/api/shares` | `{ itemId, userId, role }`로 권한 변경 |
| DELETE | `/api/shares` | `{ itemId, userId }`로 직접 공유 해제 |

폴더 생성 JSON:

```json
{ "name": "3D 프로젝트", "parentId": null }
```

파일 업로드는 `multipart/form-data`로 `file` 필드 하나를 전송합니다.
선택적으로 `parentId`, `name`을 함께 지정할 수 있습니다. 파일 최대 크기는 100 MB입니다.
요청 전체에도 크기 제한을 적용하지만 multipart 파서는 파일을 메모리에 읽습니다.
여러 파일은 각각의 요청으로 업로드하세요.

```js
const form = new FormData();
form.append("file", fileInput.files[0]);
// form.append("parentId", folderId);
const response = await fetch("/api/files", { method: "POST", body: form });
const { item } = await response.json();
```

수정은 필요한 필드만 전달합니다:

```json
{ "name": "최종 모델.glb", "parentId": null, "starred": true }
```

복원은 `{ "restore": true }`를 전달합니다. 같은 위치의 동일 이름은 `409 NAME_EXISTS`입니다.
복원 시 이름 충돌이 나면 `name`도, 부모 폴더가 삭제됐으면 `parentId`도 함께 지정하세요.
폴더 삭제는 하위 항목이 없는 경우만 가능합니다. 휴지통의 하위 항목도 포함됩니다.
휴지통 이동 시 원본 파일은 복원을 위해 남습니다. `DELETE ...?permanent=true`는 휴지통 항목만
완전 삭제하며 파일 원본과 DB 정보를 제거합니다. 휴지통에 없는 항목은 `409 NOT_IN_TRASH`입니다.
폴더 완전 삭제도 하위 항목이 없는 경우만 가능합니다. 파일 원본 삭제 실패 시 DB 항목을 유지하므로
다시 시도할 수 있습니다. 원본이 이미 없는 휴지통 파일도 DB 정보를 정리할 수 있습니다.

오류 응답은 `{ error: { code, message } }`이며 잘못된 요청 `400`, 없는 항목 `404`,
이름 충돌·폴더 상태 충돌 `409`, 크기 초과 `413`, 업로드 형식 오류 `415`를 사용합니다.

DB와 로컬 모의 인증 서버를 대상으로 통합 검사 (Next 개발 서버 불필요):

```sh
node --test tests/cloud-api.test.mjs
```

검사는 실제 비즈니스 핸들러를 호출하고 테스트용 인증 서버에서 서로 다른 두 사용자 세션을 검증합니다.
쿠키 누락·인증 실패·세션 폐기와 사용자 간 접근 차단, 실제 소유자 ID 저장을 확인합니다.
테스트 프로세스의 AUTH_URL만 변경하며 `.env`는 수정하지 않습니다.
임시 항목만 생성하고 검사 종료 후 해당 DB 행과 파일 원본을 정리합니다.
