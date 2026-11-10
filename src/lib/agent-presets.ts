export const AGENT_PRESETS = [
  { id: 'claude-code', name: 'Claude Code', command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp@0.102.0'], description: 'Gunakan akun Claude melalui adapter ACP.' },
  { id: 'codex', name: 'Codex', command: 'npx', args: ['-y', '@agentclientprotocol/codex-acp@2.6.0'], description: 'Gunakan akun Codex melalui adapter ACP.' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'], description: 'Gunakan provider dan model yang terhubung di OpenCode.' },
  { id: 'command-code', name: 'Command Code', command: 'cmd', args: ['acp'], description: 'Gunakan katalog model dan akun Command Code.' },
];
