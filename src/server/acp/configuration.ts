export type AgentChoice = { value: string; name: string; group?: string; description?: string };
export type AgentSelector = { id: string; name: string; currentValue: string; options: AgentChoice[] };
export type AgentConfigOption = AgentSelector & { category?: string };
export type AgentExecutionOptions = { model: AgentSelector | null; effort: AgentSelector | null };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function parseConfigOptions(value: unknown): AgentConfigOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(record).flatMap(option => {
    if (option.type !== 'select' || typeof option.id !== 'string' || typeof option.currentValue !== 'string' || !Array.isArray(option.options)) return [];
    const choices: AgentChoice[] = [];
    const add = (choice: unknown, group?: string) => {
      if (!record(choice) || typeof choice.value !== 'string' || typeof choice.name !== 'string') return;
      choices.push({ value: choice.value, name: choice.name, ...(group ? { group } : {}), ...(typeof choice.description === 'string' ? { description: choice.description } : {}) });
    };
    for (const choice of option.options) {
      if (record(choice) && Array.isArray(choice.options)) for (const child of choice.options) add(child, typeof choice.name === 'string' ? choice.name : typeof choice.group === 'string' ? choice.group : undefined);
      else add(choice);
    }
    return [{ id: option.id, name: typeof option.name === 'string' ? option.name : option.id, currentValue: option.currentValue, options: choices, ...(typeof option.category === 'string' ? { category: option.category } : {}) }];
  });
}
export function parseLegacyModels(value: unknown): AgentSelector | null {
  if (!record(value) || !Array.isArray(value.availableModels) || typeof value.currentModelId !== 'string') return null;
  return { id: 'legacy-model', name: 'Model', currentValue: value.currentModelId, options: value.availableModels.filter(record).flatMap(model => typeof model.modelId === 'string' ? [{ value: model.modelId, name: typeof model.name === 'string' ? model.name : model.modelId }] : []) };
}
export function executionOptions(options: AgentConfigOption[], legacy: AgentSelector | null): AgentExecutionOptions {
  const find = (category: string, names: string[]) => options.find(option => option.category === category) ?? options.find(option => names.includes(option.id.replace(/[^a-z]/gi, '').toLowerCase()));
  return { model: find('model', ['model', 'models']) ?? legacy, effort: find('thought_level', ['effort', 'reasoningeffort', 'reasoninglevel', 'thinkinglevel', 'thoughtlevel']) ?? null };
}
