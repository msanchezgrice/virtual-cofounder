// components/priority/PriorityBadge.tsx
/**
 * Priority Badge Component
 * 
 * Displays a colored badge indicating priority level (P0-P3).
 * Used in story lists, queue views, and notifications.
 */

import React from 'react';

type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

interface PriorityBadgeProps {
  priority: PriorityLevel | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const PRIORITY_CONFIG: Record<PriorityLevel, {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}> = {
  P0: {
    label: 'Critical',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    borderColor: 'border-red-300',
    description: 'Immediate action required',
  },
  P1: {
    label: 'High',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    borderColor: 'border-orange-300',
    description: 'Important, do soon',
  },
  P2: {
    label: 'Medium',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
    description: 'Standard priority',
  },
  P3: {
    label: 'Low',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-300',
    description: 'Nice to have',
  },
};

const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function PriorityBadge({
  priority,
  size = 'md',
  showLabel = false,
  className = '',
}: PriorityBadgeProps) {
  const normalizedPriority = (priority as PriorityLevel) || 'P2';
  const config = PRIORITY_CONFIG[normalizedPriority] || PRIORITY_CONFIG.P2;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${sizeClass}
        ${className}
      `}
      title={config.description}
    >
      <span className="font-bold">{normalizedPriority}</span>
      {showLabel && (
        <span className="ml-1 font-normal">{config.label}</span>
      )}
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: PriorityLevel | string }) {
  const normalizedPriority = (priority as PriorityLevel) || 'P2';
  const dotColors: Record<PriorityLevel, string> = {
    P0: 'bg-red-500',
    P1: 'bg-orange-500',
    P2: 'bg-yellow-500',
    P3: 'bg-green-500',
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${dotColors[normalizedPriority] || 'bg-gray-400'}`}
      title={PRIORITY_CONFIG[normalizedPriority]?.description}
    />
  );
}

export function PrioritySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: PriorityLevel | string;
  onChange: (priority: PriorityLevel) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PriorityLevel)}
      disabled={disabled}
      className="
        block w-full px-3 py-2 text-sm rounded-md border border-gray-300
        bg-white shadow-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
        disabled:bg-gray-100 disabled:cursor-not-allowed
      "
    >
      <option value="P0">P0 - Critical</option>
      <option value="P1">P1 - High</option>
      <option value="P2">P2 - Medium</option>
      <option value="P3">P3 - Low</option>
    </select>
  );
}

export default PriorityBadge;
