export const AgentDetailTab = {
  Prompt: 'prompt',
  Identity: 'identity',
  Skills: 'skills',
  Im: 'im',
} as const;

export type AgentDetailTab = typeof AgentDetailTab[keyof typeof AgentDetailTab];
