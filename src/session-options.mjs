import { error } from './profiles.mjs';

const selectors = {
  model: { category: 'model', ids: ['model'] },
  effort: { category: 'thought_level', ids: ['thought_level', 'reasoning_effort', 'effort', 'reasoning'] }
};

function selectOption(options, setting) {
  if (!Array.isArray(options)) return null;
  const { category, ids } = selectors[setting];
  const selects = options.filter(option => option?.type === 'select' && typeof (option.configId ?? option.id) === 'string');
  return selects.find(option => option.category === category)
    ?? selects.find(option => !option.category && ids.includes(option.configId ?? option.id));
}

function choices(option) {
  if (!Array.isArray(option?.options)) return [];
  return option.options.flatMap(row => Array.isArray(row?.options) ? row.options : [row])
    .filter(row => typeof row?.value === 'string');
}

export function describeOptions(options) {
  const result = {};
  for (const setting of Object.keys(selectors)) {
    const option = selectOption(options, setting);
    result[setting] = option ? {
      current: option.currentValue,
      choices: choices(option).map(row => ({ id: row.value, name: typeof row.name === 'string' ? row.name : row.value }))
    } : null;
  }
  return result;
}

// Each set response supplies the complete option list, including the effort
// levels for the newly selected model. Both the gateway and inspector use it.
export function* sessionSelections(options, defaults, protocolVersion = 1) {
  for (const setting of Object.keys(selectors)) {
    const value = defaults[setting];
    if (value === undefined) continue;
    const option = selectOption(options, setting);
    const available = choices(option);
    if (!available.some(row => row.value === value)) {
      const examples = available.slice(0, 6).map(row => JSON.stringify(row.value.slice(0, 100))).join(', ');
      throw error('OPTION_UNAVAILABLE', 'The bridge does not offer ' + setting + ' ' + JSON.stringify(value) +
        (examples ? '. Available choices include ' + examples : '. No choices advertised') +
        '. Run agentlink models PROFILE to inspect and agentlink defaults PROFILE to change the selection.');
    }
    if (option.currentValue !== value) {
      options = yield { configId: option.configId ?? option.id, ...(protocolVersion === 2 ? { type: 'id' } : {}), value };
      if (selectOption(options, setting)?.currentValue !== value) throw unconfirmed(setting, value);
    }
  }
  for (const [setting, value] of Object.entries(defaults)) {
    if (selectOption(options, setting)?.currentValue !== value) {
      throw unconfirmed(setting, value);
    }
  }
  return options;
}

function unconfirmed(setting, value) {
  return error('OPTION_UNCONFIRMED', 'The bridge did not confirm the selected ' + setting + ' ' + JSON.stringify(value) + '.');
}
