import { CpuChipIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../../services/i18n';
import type { Model } from '../../store/slices/modelSlice';
import ModelSelector from '../ModelSelector';
import AgentWorkingDirectoryField from './AgentWorkingDirectoryField';

interface AgentDetailToolbarProps {
  model: Model | null;
  onModelChange: (model: Model | null) => void;
  workingDirectory: string;
  onWorkingDirectoryChange: (value: string) => void;
}

const AgentDetailToolbar: React.FC<AgentDetailToolbarProps> = ({
  model,
  onModelChange,
  workingDirectory,
  onWorkingDirectoryChange,
}) => (
  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
    <div
      className="flex min-w-0 items-center gap-1 text-secondary"
      title={i18nService.t('agentDefaultModel')}
    >
      <CpuChipIcon className="h-4 w-4 flex-shrink-0" />
      <ModelSelector
        dropdownDirection="up"
        value={model}
        onChange={onModelChange}
        defaultLabel={i18nService.t('agentUseDefaultModel')}
        portal
      />
    </div>
    <AgentWorkingDirectoryField
      value={workingDirectory}
      onChange={onWorkingDirectoryChange}
      compact
    />
  </div>
);

export default AgentDetailToolbar;
