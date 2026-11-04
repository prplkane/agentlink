// Documented ACP launch recipes, not claims of live-vendor test coverage.
// Launch recipes. The manager installs selected package-backed bridges;
// inspection only discovers executables that are already installed.
const recipes = {
  codex: Object.freeze({
    kind: 'external-acp-bridge', args: [],
    executableName: 'codex-acp',
    source: 'https://github.com/agentclientprotocol/codex-acp',
    package: '@agentclientprotocol/codex-acp',
    note: 'The npm bridge includes a Codex dependency; count it separately.'
  }),
  claude: Object.freeze({
    kind: 'external-acp-bridge', args: [],
    executableName: 'claude-agent-acp',
    source: 'https://github.com/agentclientprotocol/claude-agent-acp',
    package: '@agentclientprotocol/claude-agent-acp',
    note: 'Uses the Claude Agent SDK, which is an external dependency.'
  }),
  kimi: Object.freeze({
    kind: 'native-acp', args: ['acp'], executableName: 'kimi',
    source: 'https://github.com/MoonshotAI/kimi-code',
    note: 'The old Python kimi-cli repository is archived.'
  }),
  opencode: { kind: 'native-acp', args: ['acp'], executableName: 'opencode',
    source: 'https://opencode.ai/docs/acp/' },
  qwen: { kind: 'native-acp', args: ['--acp'], executableName: 'qwen',
    source: 'https://qwenlm.github.io/qwen-code-docs/en/users/integration-zed/' },
  gemini: { kind: 'native-acp', args: ['--acp'], executableName: 'gemini',
    source: 'https://geminicli.com/docs/cli/acp-mode/' },
  cursor: { kind: 'native-acp', args: ['acp'], executableName: 'agent',
    explicitMatch: true, source: 'https://cursor.com/docs/cli/acp' },
  copilot: { kind: 'native-acp', args: ['--acp', '--stdio'], executableName: 'copilot',
    source: 'https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server' },
  cline: { kind: 'native-acp', args: ['--acp'], executableName: 'cline',
    source: 'https://github.com/cline/cline/blob/main/apps/cli/README.md' },
  auggie: { kind: 'native-acp', args: ['--acp'], executableName: 'auggie',
    source: 'https://docs.augmentcode.com/cli/v0/acp/agent' },
  vibe: { kind: 'native-acp', args: [], executableName: 'vibe-acp',
    source: 'https://github.com/mistralai/mistral-vibe' },
  antigravity: Object.freeze({
    kind: 'unavailable', args: [],
    source: 'https://antigravity.google/docs/faq',
    note: 'No supported consumer-plan third-party ACP route established.'
  })
};
export const providers = Object.freeze(Object.fromEntries(Object.entries(recipes).map(([name, recipe]) =>
  [name, Object.freeze({ ...recipe, args: Object.freeze([...recipe.args]) })])));

export function planProvider(provider, { executable, prefixArgs = [] } = {}) {
  const recipe = Object.hasOwn(providers, provider) ? providers[provider] : undefined;
  if (!recipe) throw new Error(`Unknown provider: ${provider}`);
  if (recipe.kind === 'unavailable') throw new Error(recipe.note);
  if (typeof executable !== 'string' || !Array.isArray(prefixArgs) ||
      prefixArgs.some(value => typeof value !== 'string')) {
    throw new TypeError('Provide an explicit installed executable and string arguments.');
  }
  return { command: executable, args: [...prefixArgs, ...recipe.args] };
}
