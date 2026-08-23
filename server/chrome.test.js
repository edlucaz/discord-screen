/**
 * Achar e disparar um Chromium local, com o sistema de arquivos e o
 * `child_process` trocados por dublês — nada aqui abre um navegador de
 * verdade.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const existsSync = vi.fn(() => false);
vi.mock('node:fs', () => ({ default: { existsSync: (...args) => existsSync(...args) } }));

const spawnSync = vi.fn(() => ({ error: new Error('ENOENT') }));
const unref = vi.fn();
const spawn = vi.fn(() => ({ unref }));
vi.mock('node:child_process', () => ({
  spawn: (...args) => spawn(...args),
  spawnSync: (...args) => spawnSync(...args),
}));

const plataformaOriginal = process.platform;

function comPlataforma(valor) {
  Object.defineProperty(process, 'platform', { value: valor, configurable: true });
}

afterEach(() => {
  comPlataforma(plataformaOriginal);
  vi.clearAllMocks();
  existsSync.mockReturnValue(false);
  spawnSync.mockReturnValue({ error: new Error('ENOENT') });
});

describe('abrirEmApp', () => {
  it('no Linux, procura os nomes no PATH e usa o primeiro que responde', async () => {
    comPlataforma('linux');
    spawnSync.mockImplementation((nome) => ({
      error: nome === 'chromium-browser' ? undefined : new Error('ENOENT'),
      status: nome === 'chromium-browser' ? 0 : 1,
    }));
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    const ok = abrirEmApp('https://exemplo.test/share.html?t=abc');

    expect(ok).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      'chromium-browser',
      ['--app=https://exemplo.test/share.html?t=abc'],
      expect.objectContaining({ detached: true }),
    );
    expect(unref).toHaveBeenCalled();
  });

  it('no Linux, sem nenhum nome respondendo, não dispara nada', async () => {
    comPlataforma('linux');
    spawnSync.mockReturnValue({ error: new Error('ENOENT') });
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    expect(abrirEmApp('https://exemplo.test/share.html')).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('no Windows, usa o primeiro caminho que existir', async () => {
    comPlataforma('win32');
    process.env.PROGRAMFILES = 'C:\\Program Files';
    existsSync.mockImplementation((p) => p.includes('chrome.exe'));
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    expect(abrirEmApp('https://exemplo.test/share.html')).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('chrome.exe'),
      expect.any(Array),
      expect.anything(),
    );
  });

  it('no macOS, usa o primeiro caminho que existir', async () => {
    comPlataforma('darwin');
    existsSync.mockImplementation((p) => p.includes('Chromium.app'));
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    expect(abrirEmApp('https://exemplo.test/share.html')).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('Chromium.app'),
      expect.any(Array),
      expect.anything(),
    );
  });

  it('procura só uma vez — a segunda chamada não repete a varredura', async () => {
    comPlataforma('linux');
    spawnSync.mockImplementation((nome) => ({
      error: nome === 'google-chrome-stable' ? undefined : new Error('ENOENT'),
      status: 0,
    }));
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    abrirEmApp('https://exemplo.test/a');
    spawnSync.mockClear();
    abrirEmApp('https://exemplo.test/b');

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('devolve false quando o processo não sobe', async () => {
    comPlataforma('linux');
    spawnSync.mockReturnValue({ error: undefined, status: 0 });
    spawn.mockImplementation(() => {
      throw new Error('sem permissão');
    });
    vi.resetModules();
    const { abrirEmApp } = await import('./chrome.js');

    expect(abrirEmApp('https://exemplo.test/share.html')).toBe(false);
  });
});
