# claude-guard

Claude Code 세션 보호 + 토큰 추적 + Compact 복구 (경량 버전)

## v0.3.0 - Compact 복구 기능

- **PreCompact hook**: Compact 전 transcript 파싱하여 컨텍스트 자동 저장
- **SessionStart(compact)**: Compact 후 이전 작업 컨텍스트 자동 복구
- **도구 순서 요약**: `Read → Edit → Bash → Task` 형식으로 작업 흐름 기록
- **크래시 복구 개선**: summaries 기반 복구 컨텍스트 주입

## 기능

### 1. 크래시 복구
- 매 턴마다 `current.json`에 최소 상태 저장
- 다음 세션 시작 시 비정상 종료 감지
- 이전 컨텍스트 자동 복원

### 2. Compact 복구
- Compact 전 transcript 파싱하여 `compact-context.md` 생성
- 최근 작업, 파일 변경, 참조 파일, 명령어, 도구 사용 통계 저장
- Compact 후 자동으로 컨텍스트 주입

### 3. 토큰 추적
- 세션별/일별 토큰 사용량 추적
- 예상 비용 계산
- `sessions.json`, `tokens.json`에 저장

### 4. 세션 내보내기
- 마크다운 형식으로 저장

## 설치

```bash
git clone https://github.com/honeion/claude-guard.git
cd claude-guard
npm link
```

**의존성 설치 불필요** - 순수 Node.js 모듈만 사용

## 사용법

```bash
# 활성화/비활성화
claude-guard enable
claude-guard disable

# 상태 확인
claude-guard status

# 토큰 통계
claude-guard stats
claude-guard stats --period=week
claude-guard stats --daily

# 세션 내보내기
claude-guard export
claude-guard export --here
```

## 동작 방식

### PostToolUse (매 도구 실행마다)
```javascript
// 이것만 함 - 50바이트, <5ms
writeFileSync('current.json', { tool, id, ts })
```

### Stop (응답 완료 시)
- transcript에서 토큰 파싱
- sessions.json, tokens.json 업데이트
- turns.jsonl에 턴 데이터 저장
- summaries.jsonl에 도구 순서 요약 추가 (`Read → Edit → Bash`)

### PreCompact (Compact 전)
- transcript 파싱하여 작업 컨텍스트 추출
- `compact-context.md` 생성 (최근 작업, 파일 변경, 도구 사용 통계)
- 프로젝트 `.claude/` 및 `~/.claude-guard/sessions/{id}/compact/`에 저장

### SessionStart (세션 시작 시)
- 크래시된 세션 감지 → 복구 컨텍스트 주입
- Compact 후 → `compact-context.md` 읽어서 컨텍스트 주입

## 데이터 저장

```
~/.claude-guard/
├── sessions.json     # 모든 세션 메타데이터
├── tokens.json       # 토큰 사용량 (세션별/일별)
└── sessions/{id}/
    ├── current.json      # 마지막 도구 상태
    ├── turns.jsonl       # 턴별 도구/토큰 데이터
    ├── summaries.jsonl   # 도구 순서 요약
    └── compact/
        ├── latest.md     # 최신 compact 컨텍스트
        └── YYYYMMDD_hhmmss_compact-context.md  # 타임스탬프별 백업
```

## 요구사항

- Node.js 18+
- Claude Code CLI

## 변경 로그

### v0.3.0
- **PreCompact hook**: Compact 전 transcript 파싱하여 `compact-context.md` 생성
- **SessionStart(compact)**: Compact 후 컨텍스트 자동 주입
- **도구 순서 요약**: summaries.jsonl에 `Read → Edit → Bash` 형식 저장
- **turns.jsonl**: 턴별 도구/토큰 상세 데이터 저장
- **크래시 복구 개선**: summaries 기반 복구 컨텍스트

### v0.2.0
- **성능 개선**: sql.js 완전 제거, 파일 기반으로 전환
- **PostToolUse 최소화**: DB 접근 제거, current.json만 쓰기
- **의존성 제거**: 외부 패키지 0개

### v0.1.x
- 초기 버전 (sql.js 사용)

## 라이센스

MIT
