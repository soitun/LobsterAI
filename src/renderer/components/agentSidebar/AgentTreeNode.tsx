import React from 'react';

import { i18nService } from '../../services/i18n';
import { getAgentDisplayName, shouldUseDefaultAgentIcon } from '../../utils/agentDisplay';
import DefaultAgentIcon from '../icons/DefaultAgentIcon';
import AgentTaskRow from './AgentTaskRow';
import ExpandAgentTasksRow from './ExpandAgentTasksRow';
import type { AgentSidebarAgentNode, AgentSidebarTaskNode } from './types';

interface AgentTreeNodeProps {
  agent: AgentSidebarAgentNode;
  isBatchMode: boolean;
  selectedIds: Set<string>;
  showBatchOption?: boolean;
  onToggleExpanded: (agentId: string) => void;
  onRetryLoadTasks: (agentId: string) => void;
  onLoadMoreTasks: (agentId: string) => void;
  onCollapseTasks: (agentId: string) => void;
  onSelectTask: (task: AgentSidebarTaskNode) => void;
  onDeleteTask: (task: AgentSidebarTaskNode) => Promise<void>;
  onToggleTaskPin: (task: AgentSidebarTaskNode, pinned: boolean) => Promise<void>;
  onRenameTask: (task: AgentSidebarTaskNode, title: string) => Promise<void>;
  onToggleSelection: (sessionId: string) => void;
  onEnterBatchMode: (task: AgentSidebarTaskNode) => void;
}

const getAgentAvatarText = (agent: AgentSidebarAgentNode) => {
  if (agent.icon?.trim()) return agent.icon;
  const first = getAgentDisplayName(agent).trim().slice(0, 1);
  return first ? first.toUpperCase() : 'A';
};

const AgentAvatar: React.FC<{ agent: AgentSidebarAgentNode }> = ({ agent }) => {
  if (shouldUseDefaultAgentIcon(agent)) {
    return <DefaultAgentIcon className="h-5 w-5" />;
  }

  return <>{getAgentAvatarText(agent)}</>;
};

const AgentTreeNode: React.FC<AgentTreeNodeProps> = ({
  agent,
  isBatchMode,
  selectedIds,
  showBatchOption = false,
  onToggleExpanded,
  onRetryLoadTasks,
  onLoadMoreTasks,
  onCollapseTasks,
  onSelectTask,
  onDeleteTask,
  onToggleTaskPin,
  onRenameTask,
  onToggleSelection,
  onEnterBatchMode,
}) => {
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onToggleExpanded(agent.id)}
        className="-ml-[6px] flex h-[34px] w-[calc(100%+12px)] items-center gap-2 rounded-md py-0 pl-1.5 pr-2.5 text-left text-[13px] text-secondary transition-colors hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/[0.04]"
        role="treeitem"
        aria-level={1}
        aria-expanded={agent.isExpanded}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[15px] leading-none text-foreground">
          <AgentAvatar agent={agent} />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {getAgentDisplayName(agent)}
        </span>
      </button>

      {agent.isExpanded && (
        <div className="space-y-0.5" role="group">
          {agent.hasLoadError && agent.tasks.length === 0 && (
            <button
              type="button"
              onClick={() => onRetryLoadTasks(agent.id)}
              className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center rounded-md pl-[38px] pr-2.5 text-left text-[13px] text-red-500 transition-colors hover:bg-red-500/10"
            >
              {i18nService.t('myAgentSidebarLoadFailed')}
            </button>
          )}

          {agent.isLoadingTasks && agent.tasks.length === 0 && (
            <div className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center pl-[38px] pr-2.5 text-[13px] text-secondary">
              {i18nService.t('loading')}
            </div>
          )}

          {!agent.isLoadingTasks && !agent.hasLoadError && agent.tasks.length === 0 && (
            <div className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center pl-[38px] pr-2.5 text-[13px] text-secondary/80">
              {i18nService.t('myAgentSidebarNoTasks')}
            </div>
          )}

          {agent.tasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              task={task}
              isBatchMode={isBatchMode}
              isSelected={selectedIds.has(task.id)}
              showBatchOption={showBatchOption}
              onSelect={() => onSelectTask(task)}
              onDelete={() => onDeleteTask(task)}
              onTogglePin={(pinned) => onToggleTaskPin(task, pinned)}
              onRename={(title) => onRenameTask(task, title)}
              onToggleSelection={() => onToggleSelection(task.id)}
              onEnterBatchMode={() => onEnterBatchMode(task)}
            />
          ))}

          {agent.hasLoadError && agent.tasks.length > 0 && (
            <button
              type="button"
              onClick={() => onRetryLoadTasks(agent.id)}
              className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center rounded-md pl-[38px] pr-2.5 text-left text-[13px] text-red-500 transition-colors hover:bg-red-500/10"
            >
              {i18nService.t('myAgentSidebarLoadFailed')}
            </button>
          )}

          {agent.canExpandTasks && (
            <ExpandAgentTasksRow
              isLoading={agent.isLoadingTasks}
              label={i18nService.t('myAgentSidebarExpandMore')}
              onClick={() => onLoadMoreTasks(agent.id)}
            />
          )}
          {agent.canCollapseTasks && (
            <ExpandAgentTasksRow
              isLoading={false}
              label={i18nService.t('myAgentSidebarCollapse')}
              onClick={() => onCollapseTasks(agent.id)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default AgentTreeNode;
