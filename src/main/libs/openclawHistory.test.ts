import { describe, expect, test } from 'vitest';
import {
  buildScheduledReminderSystemMessage,
  extractGatewayHistoryEntries,
  extractGatewayHistoryEntry,
  extractGatewayMessageText,
  isHeartbeatAckText,
  isHeartbeatPromptText,
  isPreCompactionMemoryFlushPromptText,
  isSilentTokenPrefixText,
  isSilentTokenText,
} from './openclawHistory';

describe('openclawHistory', () => {
  test('extracts plain text content blocks', () => {
    expect(
      extractGatewayMessageText({
        content: [{ type: 'text', text: 'hello world' }],
      })
    ).toBe('hello world');
  });

  test('extracts output_text style content blocks', () => {
    expect(
      extractGatewayMessageText({
        content: [{ type: 'output_text', text: 'gemini output' }],
      })
    ).toBe('gemini output');
  });

  test('extracts nested parts content blocks', () => {
    expect(
      extractGatewayMessageText({
        content: {
          parts: [
            { text: 'first line' },
            { type: 'toolCall', name: 'message', arguments: { action: 'send' } },
            { text: 'second line' },
          ],
        },
      })
    ).toBe('first line\nsecond line');
  });

  test('builds history entry from assistant message with non-anthropic text shape', () => {
    expect(
      extractGatewayHistoryEntry({
        role: 'assistant',
        content: [{ type: 'output_text', text: 'final answer' }],
      })
    ).toEqual({
      role: 'assistant',
      text: 'final answer',
    });
  });

  test('joins text content blocks separated by toolCall blocks', () => {
    const text = extractGatewayMessageText({
      content: [
        { type: 'text', text: 'First line' },
        { type: 'toolCall', name: 'cron', arguments: { action: 'add' } },
        { type: 'text', text: 'Second line' },
      ],
    });
    expect(text).toBe('First line\nSecond line');
  });

  test('keeps system messages', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'system',
      content: [{ type: 'text', text: 'Reminder fired' }],
    });
    expect(entry).toEqual({ role: 'system', text: 'Reminder fired' });
  });

  test('filters pure heartbeat ack assistant messages', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'assistant',
      content: [{ type: 'text', text: 'HEARTBEAT_OK' }],
    });
    expect(entry).toBeNull();
  });

  test('filters pure silent token assistant messages', () => {
    expect(
      extractGatewayHistoryEntry({
        role: 'assistant',
        content: [{ type: 'text', text: 'NO_REPLY' }],
      })
    ).toBeNull();
    expect(
      extractGatewayHistoryEntry({
        role: 'assistant',
        content: [{ type: 'text', text: '`no_reply`' }],
      })
    ).toBeNull();
  });

  test('filters pre-compaction memory flush user messages', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'user',
      content: `Pre-compaction memory flush. Store durable memories only in memory/2026-05-09.md (create memory/ if needed). Treat workspace bootstrap/reference files such as MEMORY.md as read-only during this flush. If nothing to store, reply with NO_REPLY.
Current time: Saturday, May 9th, 2026 - 11:57 (Asia/Shanghai) / 2026-05-09 03:57 UTC`,
    });
    expect(entry).toBeNull();
  });

  test('filters pure heartbeat ack system messages with punctuation wrappers', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'system',
      content: [{ type: 'text', text: '("HEARTBEAT_OK")' }],
    });
    expect(entry).toBeNull();
  });

  test('filters heartbeat prompt user messages', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'user',
      content: `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.
When reading HEARTBEAT.md, use workspace file /tmp/HEARTBEAT.md.
Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.`,
    });
    expect(entry).toBeNull();
  });

  test('filters unsupported roles and empty messages', () => {
    const entries = extractGatewayHistoryEntries([
      { role: 'user', content: 'Set a reminder' },
      { role: 'system', content: [{ type: 'text', text: 'Reminder fired' }] },
      { role: 'tool', content: 'ignored' },
      { role: 'assistant', content: [{ type: 'toolCall', name: 'cron', arguments: {} }] },
      { role: 'assistant', content: 'Done' },
    ]);
    expect(entries).toEqual([
      { role: 'user', text: 'Set a reminder' },
      { role: 'system', text: 'Reminder fired' },
      { role: 'assistant', text: 'Done' },
    ]);
  });

  test('remaps scheduled reminder prompts to system messages', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'user',
      content: `A scheduled reminder has been triggered. The reminder content is:

⏰ 提醒：该去买菜了！

Handle this reminder internally. Do not relay it to the user unless explicitly requested.
Current time: Sunday, March 15th, 2026 — 11:27 (Asia/Shanghai)`,
    });
    expect(entry).toEqual({ role: 'system', text: '⏰ 提醒：该去买菜了！' });
  });

  test('remaps plain scheduled reminder text to a system message', () => {
    const entry = extractGatewayHistoryEntry({
      role: 'user',
      content: '⏰ 提醒：该去钉钉打卡啦！别忘了打卡哦～',
    });
    expect(entry).toEqual({ role: 'system', text: '⏰ 提醒：该去钉钉打卡啦！别忘了打卡哦～' });
  });

  test('buildScheduledReminderSystemMessage returns null for regular user text', () => {
    expect(buildScheduledReminderSystemMessage('普通聊天消息')).toBeNull();
  });

  test('isHeartbeatAckText matches token with lightweight wrappers only', () => {
    expect(isHeartbeatAckText('HEARTBEAT_OK')).toBe(true);
    expect(isHeartbeatAckText('`HEARTBEAT_OK`')).toBe(true);
    expect(isHeartbeatAckText('HEARTBEAT_OK: all clear')).toBe(false);
  });

  test('isHeartbeatPromptText matches canonical heartbeat instructions only', () => {
    expect(
      isHeartbeatPromptText(`Read HEARTBEAT.md if it exists.
When reading HEARTBEAT.md, use workspace file /tmp/HEARTBEAT.md.
Do not infer or repeat old tasks from prior chats.
If nothing needs attention, reply HEARTBEAT_OK.`)
    ).toBe(true);
    expect(isHeartbeatPromptText('Please read README.md and reply OK.')).toBe(false);
  });

  test('silent and memory flush detectors are narrow', () => {
    expect(isSilentTokenText('NO_REPLY')).toBe(true);
    expect(isSilentTokenPrefixText('NO_REP')).toBe(true);
    expect(isSilentTokenPrefixText('NO_REPLY')).toBe(false);
    expect(isSilentTokenPrefixText('NO_REPLY after saving memory')).toBe(false);
    expect(isSilentTokenText('NO_REPLY after saving memory')).toBe(false);
    expect(isPreCompactionMemoryFlushPromptText(`Pre-compaction memory flush.
Store durable memories only in memory/2026-05-09.md.
If nothing to store, reply with NO_REPLY.`)).toBe(true);
    expect(isPreCompactionMemoryFlushPromptText('Please write a memory summary.')).toBe(false);
  });
});
