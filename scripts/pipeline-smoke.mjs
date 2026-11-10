import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['--test', 'tests/pipeline.test.mts'], {
  stdio: 'inherit', env: { ...process.env, OPENMOTION_RENDER_TESTS: '1' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
