#!/usr/bin/env node

/**
 * PreCompact Hook - Generate compact-context.md before compaction
 * Extracts recent work context from transcript for post-compact recovery
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GUARD_DIR = join(homedir(), '.claude-guard');
const SESSIONS_DIR = join(GUARD_DIR, 'sessions');

let input = '';
const chunks = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  input = chunks.join('');
  main();
});

function parseTranscript(transcriptPath) {
  const result = {
    recentGoals: [],      // 최근 사용자 요청
    modifiedFiles: [],    // 수정된 파일
    createdFiles: [],     // 생성된 파일
    readFiles: [],        // 읽은 파일
    commands: [],         // 실행한 명령어
    tools: {},            // 도구 사용 횟수
    lastUserMessage: '',  // 마지막 사용자 메시지
  };

  try {
    const content = readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    // 최근 200줄만 파싱 (성능)
    const recentLines = lines.slice(-200);

    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);

        // 사용자 메시지
        if (entry.type === 'user' && entry.message?.content) {
          const content = typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content[0]?.text || '';
          if (content.length > 10 && content.length < 500) {
            result.recentGoals.push(content.slice(0, 200));
            result.lastUserMessage = content.slice(0, 300);
          }
        }

        // 도구 사용
        if (entry.type === 'assistant' && entry.message?.content) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              const toolName = block.name;
              const toolInput = block.input || {};

              // 도구 카운트
              result.tools[toolName] = (result.tools[toolName] || 0) + 1;

              // 파일 경로 추출
              if (toolInput.file_path) {
                const filePath = toolInput.file_path.replace(/\\/g, '/');
                const shortPath = filePath.split('/').slice(-3).join('/');

                if (toolName === 'Write') {
                  if (!result.createdFiles.includes(shortPath)) {
                    result.createdFiles.push(shortPath);
                  }
                } else if (toolName === 'Edit') {
                  if (!result.modifiedFiles.includes(shortPath)) {
                    result.modifiedFiles.push(shortPath);
                  }
                } else if (toolName === 'Read') {
                  if (!result.readFiles.includes(shortPath)) {
                    result.readFiles.push(shortPath);
                  }
                }
              }

              // Bash 명령어 추출
              if (toolName === 'Bash' && toolInput.command) {
                const cmd = toolInput.command.slice(0, 80);
                if (!result.commands.includes(cmd)) {
                  result.commands.push(cmd);
                }
              }
            }
          }
        }
      } catch {}
    }

    // 최근 5개씩만 유지
    result.recentGoals = result.recentGoals.slice(-3);
    result.modifiedFiles = result.modifiedFiles.slice(-10);
    result.createdFiles = result.createdFiles.slice(-10);
    result.readFiles = result.readFiles.slice(-10);
    result.commands = result.commands.slice(-5);

  } catch (e) {
    // 파싱 실패해도 계속 진행
  }

  return result;
}

function generateContextMd(data, cwd) {
  const lines = [];

  lines.push('# Compact Context Recovery');
  lines.push('');
  lines.push(`> Auto-generated at ${new Date().toLocaleString('ko-KR')}`);
  lines.push(`> Project: ${cwd}`);
  lines.push('');

  // 최근 작업 목표
  if (data.lastUserMessage) {
    lines.push('## 최근 작업');
    lines.push('');
    lines.push(data.lastUserMessage);
    lines.push('');
  }

  // 수정/생성된 파일
  if (data.modifiedFiles.length > 0 || data.createdFiles.length > 0) {
    lines.push('## 파일 변경');
    lines.push('');
    if (data.createdFiles.length > 0) {
      lines.push('**생성:**');
      data.createdFiles.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }
    if (data.modifiedFiles.length > 0) {
      lines.push('**수정:**');
      data.modifiedFiles.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }
  }

  // 주요 읽은 파일
  if (data.readFiles.length > 0) {
    lines.push('## 참조한 파일');
    lines.push('');
    data.readFiles.slice(-5).forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  // 실행한 명령어
  if (data.commands.length > 0) {
    lines.push('## 실행한 명령어');
    lines.push('');
    lines.push('```bash');
    data.commands.forEach(c => lines.push(c));
    lines.push('```');
    lines.push('');
  }

  // 도구 사용 통계
  if (Object.keys(data.tools).length > 0) {
    lines.push('## 도구 사용');
    lines.push('');
    const sorted = Object.entries(data.tools).sort((a, b) => b[1] - a[1]);
    sorted.slice(0, 5).forEach(([tool, count]) => {
      lines.push(`- ${tool}: ${count}회`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  try {
    if (!input?.trim()) {
      process.stdout.write('{"continue":true}');
      return;
    }

    const event = JSON.parse(input);
    const sessionId = event?.session_id;
    const transcriptPath = event?.transcript_path;
    const cwd = event?.cwd || '';
    const trigger = event?.trigger || 'unknown';

    if (!sessionId || !transcriptPath) {
      process.stdout.write('{"continue":true}');
      return;
    }

    // 세션 compact 폴더 생성
    const compactDir = join(SESSIONS_DIR, sessionId, 'compact');
    if (!existsSync(compactDir)) {
      mkdirSync(compactDir, { recursive: true });
    }

    // 파일명: YYYYMMDD_hhmmss_compact-context.md
    const now = new Date();
    const timestamp = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('');

    const filename = `${timestamp}_compact-context.md`;
    const filePath = join(compactDir, filename);

    // Transcript 파싱
    const data = parseTranscript(transcriptPath);

    // Context MD 생성
    const mdContent = generateContextMd(data, cwd);

    // 파일 저장 (claude-guard 폴더)
    writeFileSync(filePath, mdContent, 'utf8');

    // 최신 파일 (claude-guard 폴더)
    const latestPath = join(compactDir, 'latest.md');
    try {
      writeFileSync(latestPath, mdContent, 'utf8');
    } catch {}

    // 프로젝트 .claude 폴더에도 저장 (Claude Code가 자동으로 읽음)
    if (cwd) {
      try {
        const projectClaudeDir = join(cwd, '.claude');
        if (!existsSync(projectClaudeDir)) {
          mkdirSync(projectClaudeDir, { recursive: true });
        }
        const projectContextPath = join(projectClaudeDir, 'compact-context.md');
        writeFileSync(projectContextPath, mdContent, 'utf8');
      } catch {}
    }

    process.stdout.write('{"continue":true}');
  } catch {
    process.stdout.write('{"continue":true}');
  }
}
