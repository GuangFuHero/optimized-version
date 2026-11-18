import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * 確保本機測試資料庫中的超級管理員 `asuper01@mock.test` 與資料稽核員 `aaudit01@mock.test`
 * 已設定預設測試密碼 `Mock1234!`（因 seed_mock_scenarios.sql 基於安全考量未預設密碼）。
 */
export default async function globalSetup(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..');
  const pyCode = [
    'import asyncio',
    'from scripts.set_password import _run',
    'async def main():',
    '    await _run("asuper01@mock.test", "Mock1234!")',
    '    await _run("aaudit01@mock.test", "Mock1234!")',
    'asyncio.run(main())',
  ].join('\n');

  try {
    execFileSync('uv', ['--directory', 'Backend', 'run', 'python', '-c', pyCode], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    // Fallback if uv is not on PATH or DB is unreachable: ignore and let tests report
  }
}
