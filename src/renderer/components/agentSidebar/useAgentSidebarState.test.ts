import { expect, test } from 'vitest';

import {
  type CoworkSessionStatus,
  CoworkSessionStatusValue,
  type CoworkSessionSummary,
} from '../../types/cowork';
import {
  collapseAgentSidebarTaskList,
  sortAgentSidebarTasks,
} from './useAgentSidebarState';

const makeSession = (
  id: string,
  createdAt: number,
  status: CoworkSessionStatus = CoworkSessionStatusValue.Completed,
): CoworkSessionSummary => ({
  id,
  title: id,
  status,
  pinned: false,
  agentId: 'main',
  createdAt,
  updatedAt: Date.now() - createdAt,
});

test('sortAgentSidebarTasks keeps tasks ordered by creation time', () => {
  const sorted = sortAgentSidebarTasks([
    makeSession('older-running', 100, CoworkSessionStatusValue.Running),
    makeSession('newer', 300),
    makeSession('middle', 200),
  ]);

  expect(sorted.map((session) => session.id)).toEqual([
    'newer',
    'middle',
    'older-running',
  ]);
});

test('collapseAgentSidebarTaskList resets one agent history list to preview mode', () => {
  expect(collapseAgentSidebarTaskList(['agent-1', 'agent-2'], 'agent-1')).toEqual(['agent-2']);
});
