import React from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkContextUsage } from '../../types/cowork';
import { formatTokenCount } from '../../utils/tokenFormat';

interface ContextUsageIndicatorProps {
  usage?: CoworkContextUsage;
  compacting?: boolean;
  disabled?: boolean;
  onCompact?: () => void;
}

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const formatTooltip = (usage?: CoworkContextUsage): string => {
  if (!usage || typeof usage.percent !== 'number') {
    return i18nService.t('coworkContextUsageUnknown');
  }
  const lines = [
    i18nService.t('coworkContextUsagePercent').replace('{percent}', String(usage.percent)),
  ];
  if (typeof usage.usedTokens === 'number' && typeof usage.contextTokens === 'number') {
    lines.push(
      i18nService.t('coworkContextUsageTokens')
        .replace('{used}', formatTokenCount(usage.usedTokens))
        .replace('{total}', formatTokenCount(usage.contextTokens)),
    );
  }
  return lines.join('\n');
};

const resolveColorClass = (percent?: number): string => {
  if (percent === undefined) return 'text-secondary';
  if (percent >= 90) return 'text-red-500';
  if (percent >= 70) return 'text-amber-500';
  return 'text-primary';
};

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  usage,
  compacting = false,
  disabled = false,
  onCompact,
}) => {
  const percent = typeof usage?.percent === 'number' ? usage.percent : undefined;
  if (!compacting && percent === undefined) {
    return null;
  }
  const offset = percent === undefined
    ? CIRCUMFERENCE
    : CIRCUMFERENCE * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  const colorClass = usage?.status === 'danger'
    ? 'text-red-500'
    : usage?.status === 'warning'
      ? 'text-amber-500'
      : resolveColorClass(percent);
  const isDisabled = disabled || compacting || !onCompact;
  const tooltip = compacting ? i18nService.t('coworkContextCompacting') : formatTooltip(usage);
  const tooltipLines = tooltip.split('\n');

  return (
    <span className="group relative inline-flex flex-shrink-0">
      <button
        type="button"
        onClick={onCompact}
        disabled={isDisabled}
        aria-label={tooltip}
        className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
          isDisabled
            ? 'cursor-default text-secondary/70'
            : 'text-secondary hover:bg-surface-raised hover:text-foreground'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${compacting ? 'animate-spin text-primary' : colorClass}`}
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            opacity="0.22"
          />
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 12 12)"
          />
        </svg>
        {percent !== undefined && percent >= 90 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        )}
      </button>
      <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden min-w-max max-w-[260px] whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1.5 text-left text-xs leading-5 text-foreground shadow-elevated group-hover:block group-focus-within:block">
        {tooltipLines.map((line, index) => (
          <React.Fragment key={`${line}-${index}`}>
            {line}
            {index < tooltipLines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    </span>
  );
};

export default ContextUsageIndicator;
