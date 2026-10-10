# 테이블 정의서 자동 생성 시스템

로컬 DB 메타데이터를 읽어 웹에서 테이블 정의서를 만들고 Excel/Markdown으로 내보내는 도구입니다.

기능 상세: [`docs/기능정의서.md`](docs/기능정의서.md)

## 구성

- `server/` — Node.js + Express API (localhost:8787)
- `web/` — React + Vite UI (localhost:5173)
- 지원 DBMS: PostgreSQL, MySQL/MariaDB, SQLite, SQL Server, Oracle

## 요구 사항

- Node.js 22+ (SQLite는 내장 `node:sqlite` 사용, 권장 24+)
- 대상 DB에 접근 가능한 네트워크/계정

## 실행

```bash
# 의존성 설치
npm run install:all

# 터미널 1 — API
npm run dev:server

# 터미널 2 — UI
npm run dev:web
```

브라우저에서 http://localhost:5173 접속

## 사용 흐름

1. **연결 관리**에서 DB 연결 등록·테스트
2. **탐색 / 생성**에서 스키마·테이블 선택 후 정의서 생성
3. 화면에서 확인 후 **Excel** 또는 **Markdown** 내보내기
4. 필요 시 **재동기화**로 최신 스키마 반영
5. **설정**에서 데이터 저장 경로·문서 헤더 수정

## 데이터 저장

기본 경로:

- Windows: `%APPDATA%\table-define-doc\`
- macOS: `~/Library/Application Support/table-define-doc/`
- Linux: `~/.config/table-define-doc/`

연결 비밀번호는 AES-256-GCM으로 암호화해 저장합니다. 인증(로그인)은 없으며 API는 기본 `127.0.0.1`에만 바인딩됩니다.
