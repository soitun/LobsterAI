import { describe, expect, test } from 'vitest';

import { DeliveryMode, PayloadKind, ScheduleKind, SessionTarget, WakeMode } from '../../../scheduledTask/constants';
import type { ScheduledTask } from '../../../scheduledTask/types';
import { createScheduledTaskFormState } from './TaskForm';

const fallbackModelRef = 'openai/gpt-5.5';

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    name: 'Daily summary',
    description: '',
    enabled: true,
    schedule: { kind: ScheduleKind.Cron, expr: '0 9 * * *' },
    sessionTarget: SessionTarget.Isolated,
    wakeMode: WakeMode.Now,
    payload: { kind: PayloadKind.AgentTurn, message: 'Summarize updates' },
    delivery: { mode: DeliveryMode.None },
    agentId: null,
    sessionKey: null,
    state: {
      nextRunAtMs: null,
      lastRunAtMs: null,
      lastStatus: null,
      lastError: null,
      lastDurationMs: null,
      runningAtMs: null,
      consecutiveErrors: 0,
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('createScheduledTaskFormState', () => {
  test('uses the fallback model for new tasks', () => {
    const form = createScheduledTaskFormState(undefined, fallbackModelRef);

    expect(form.modelId).toBe(fallbackModelRef);
  });

  test('backfills old agent-turn tasks that do not have a model', () => {
    const form = createScheduledTaskFormState(makeTask(), fallbackModelRef);

    expect(form.modelId).toBe(fallbackModelRef);
  });

  test('keeps an explicit existing task model', () => {
    const form = createScheduledTaskFormState(makeTask({
      payload: {
        kind: PayloadKind.AgentTurn,
        message: 'Summarize updates',
        model: 'anthropic/claude-sonnet-4',
      },
    }), fallbackModelRef);

    expect(form.modelId).toBe('anthropic/claude-sonnet-4');
  });

  test('does not assign a model when editing a system-event task', () => {
    const form = createScheduledTaskFormState(makeTask({
      payload: {
        kind: PayloadKind.SystemEvent,
        text: 'Reminder',
      },
    }), fallbackModelRef);

    expect(form.payloadText).toBe('Reminder');
    expect(form.modelId).toBe('');
  });
});
