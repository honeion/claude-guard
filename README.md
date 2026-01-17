# claude-guard

Claude Code 세션 보호 + 토큰 추적 (경량 버전)

## v0.2.0 - 성능 최적화

- **sql.js 제거**: WASM 로드 오버헤드 완전 제거
- **파일 기반 저장**: 순수 JSON 파일만 사용
- **PostToolUse 최소화**: current.json 50바이트만 쓰기 (<5ms)
- **의존성 0개**: Node.js 기본 모듈만 사용

## 기능

### 1. 크래시 복구
- 매 턴마다 `current.json`에 최소 상태 저장
- 다음 세션 시작 시 비정상 종료 감지
- 이전 컨텍스트 자동 복원

### 2. 토큰 추적
- 세션별/일별 토큰 사용량 추적
- 예상 비용 계산
- `sessions.json`, `tokens.json`에 저장

### 3. 세션 내보내기
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
- summaries.jsonl에 요약 추가

### SessionStart (세션 시작 시)
- 크래시된 세션 감지
- 복구 컨텍스트 주입

## 데이터 저장

```
~/.claude-guard/
├── sessions.json     # 모든 세션 메타데이터
├── tokens.json       # 토큰 사용량 (세션별/일별)
└── sessions/{id}/
    ├── current.json      # 마지막 도구 상태
    └── summaries.jsonl   # 세션 요약
```

## 요구사항

- Node.js 18+
- Claude Code CLI

## 변경 로그

### v0.2.0
- **성능 개선**: sql.js 완전 제거, 파일 기반으로 전환
- **PostToolUse 최소화**: DB 접근 제거, current.json만 쓰기
- **의존성 제거**: 외부 패키지 0개

### v0.1.x
- 초기 버전 (sql.js 사용)

## 라이센스

MIT
