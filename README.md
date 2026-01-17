# claude-guard

Claude Code 세션 보호 + 토큰 추적

## 만든 이유

- VSCode 크래시 → 세션 날아감
- API overload → 작업 중단
- 토큰 사용량 확인 불가

## 기능

### 1. 크래시 복구
- 매 턴마다 `current.json`에 현재 상태 저장
- VSCode 크래시 시 세션이 `active` 상태로 남음
- 다음 세션 시작 시 이를 감지하고 이전 컨텍스트 자동 주입
- 마지막 작업 내용, 수정한 파일, 진행 상황 복원

### 2. 토큰 추적
- 세션별 input/output 토큰 분리 추적
- 일별, 주별, 월별 통계 조회
- 예상 비용 계산 (Claude 3.5 Sonnet 기준)
- SQLite에 저장되어 장기 데이터 보존

### 3. 점진적 요약
- 5턴마다 자동으로 요약 생성
- Claude API 호출 없이 규칙 기반으로 추출
- 도구 사용 패턴에서 자동 요약 (Read → "파일 읽음", Edit → "파일 수정")
- `summaries.jsonl`에 append-only로 저장

### 4. MD 내보내기
- 세션 히스토리를 마크다운 파일로 저장
- 작업 흐름, 수정한 파일, 토큰 사용량 포함
- `--here` 옵션으로 프로젝트 폴더에 저장 가능

### 5. 한글 인코딩
- Hook 실행 시 UTF-8 강제 설정
- Git Bash, PowerShell에서 한글 깨짐 방지

## 기대 효과

- 크래시로 인한 작업 손실 방지
- 토큰 사용량 파악으로 비용 관리
- 세션 기록 보존으로 작업 연속성 확보
- 별도 서버 없이 로컬 파일로 동작 (오버헤드 최소화)

## 설치

```bash
git clone https://github.com/honeion/claude-guard.git
cd claude-guard
npm install
npm link
```

- 네이티브 빌드 불필요 (sql.js 사용)
- Visual Studio, Python 등 추가 설치 없음

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
claude-guard export --name="작업명"
```

## 동작 방식

Claude Code의 Hook 시스템을 활용합니다.

### SessionStart
- 세션 시작 시 실행
- `guard.db`에서 `status = 'active'`인 이전 세션 확인
- 크래시된 세션 발견 시:
  - 해당 세션을 `crashed`로 마킹
  - `summaries.jsonl`에서 작업 히스토리 로드
  - `current.json`에서 마지막 상태 로드
  - 복구 컨텍스트를 Claude에게 주입

### PostToolUse
- 매 도구 실행 후 실행 (Read, Write, Edit, Bash 등)
- `current.json`에 현재 상태 덮어쓰기:
  - 현재 턴 번호
  - 마지막 도구, 도구 입력값
  - 타임스탬프
- 토큰 사용량 기록
- 5턴마다 `summaries.jsonl`에 요약 추가

### Stop
- Claude 응답 완료 시 실행
- 남은 턴들 최종 요약 생성
- 세션 상태를 `completed`로 마킹

### SessionEnd
- 세션 완전 종료 시 실행
- 아직 `active`면 `completed`로 마킹
- 정리 작업

## 데이터 저장 위치

```
~/.claude-guard/
├── guard.db              # SQLite
└── sessions/
    └── {session_id}/
        ├── meta.json
        ├── current.json
        ├── summaries.jsonl
        └── tokens.json
```

## 크래시 복구 예시

```
[세션 복구 - 비정상 종료 감지됨]

## 작업 히스토리:
- Turn 1-5: package.json 읽음
- Turn 6-10: src/auth.ts 수정

## 마지막 상태 (Turn 11):
- 요청: "테스트 실행해줘"
- 상태: 중단됨
```

## 요구사항

- Node.js 18+
- Claude Code CLI

## 알려진 제한사항

- **output_tokens 정확도**: Claude Code transcript에 스트리밍 중간값만 저장되어 output 토큰 수치가 실제보다 낮게 나올 수 있음. input_tokens는 정확함.

## 변경 로그

### v0.1.2
- **버그 수정**: `stats`에서 세션별 토큰 사용량 표시
- **버그 수정**: `export`에서 토큰이 0으로 나오던 문제 (DB에서 읽도록 수정)
- **버그 수정**: Turn 범위 겹침 문제 (Stop hook에서 `last_summary_turn` 업데이트 누락)
- **개선**: 세션 제목 표시 (첫 요약에서 추출)

### v0.1.1
- **성능 개선**: PostToolUse에서 토큰 파싱 제거, Stop hook에서 한 번만 계산
- **버그 수정**: crash 감지 로직 보수적으로 변경 (10분 이상 + current.json 있는 경우만)
- **버그 수정**: 에러 시 process.exit 대신 continue: true 반환

### v0.1.0
- 초기 릴리즈

## 라이센스

MIT
