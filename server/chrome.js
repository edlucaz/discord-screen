import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Abre a página de captura num Chromium de verdade, em modo app — sem barra de
 * endereço nem abas, como se fosse um programa instalado — em vez de deixar o
 * sistema (ou o Discord, via openExternalLink) escolher o navegador padrão.
 * Existe porque esse padrão pode ser qualquer coisa, e a captura exige
 * WebCodecs: só Chromium tem.
 *
 * Só faz sentido quando este servidor roda na mesma máquina de quem pediu, que
 * é o caso normal deste projeto — rodando localmente ou via `start:fast`. Um
 * VPS não tem Chrome instalado, `caminhoDoChrome` devolve null, e quem chamou
 * cai de volta no link externo de sempre.
 */

/**
 * Onde procurar, por sistema. Windows e macOS instalam em caminho fixo, então
 * o teste é `existsSync`. Linux não tem — distribuição demais, gerenciador de
 * pacote demais —, então o teste é o nome no PATH, do jeito que
 * `scripts/cloudflared.mjs` já faz para o próprio cloudflared.
 *
 * Edge entra na lista porque é Chromium por baixo e tem WebCodecs: quem só tem
 * Edge instalado — comum em Windows de fábrica — ainda ganha o benefício.
 */
function candidatosWindows() {
  const bases = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const subcaminhos = [
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ];
  return bases.flatMap((base) => subcaminhos.map((partes) => path.join(base, ...partes)));
}

function candidatosMac() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
}

const NOMES_LINUX = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
  'microsoft-edge-stable',
  'microsoft-edge',
];

// undefined = ainda não procurado; null = procurou e não achou. Procurado uma
// vez só — o que está instalado não muda no meio do processo.
let cache;

/** O executável de um Chromium instalado, ou null. */
function caminhoDoChrome() {
  if (cache !== undefined) return cache;

  if (process.platform === 'win32') {
    cache = candidatosWindows().find((p) => fs.existsSync(p)) ?? null;
  } else if (process.platform === 'darwin') {
    cache = candidatosMac().find((p) => fs.existsSync(p)) ?? null;
  } else {
    cache =
      NOMES_LINUX.find((nome) => {
        const r = spawnSync(nome, ['--version']);
        return !r.error && r.status === 0;
      }) ?? null;
  }
  return cache;
}

/**
 * Dispara o Chromium encontrado apontando para `url`, em processo solto.
 *
 * `detached` + `unref` fazem o Node não esperar por ele nem arrastá-lo junto
 * quando o servidor cair ou reiniciar — a janela de captura precisa sobreviver
 * a um restart do servidor sem piscar.
 *
 * @returns {boolean} true se o processo foi disparado. Não confirma que a
 * janela chegou a abrir — só que o sistema aceitou o pedido.
 */
export function abrirEmApp(url) {
  const chrome = caminhoDoChrome();
  if (!chrome) return false;

  try {
    const processo = spawn(chrome, [`--app=${url}`], { detached: true, stdio: 'ignore' });
    processo.unref();
    return true;
  } catch {
    return false;
  }
}

/** Exportado só para o teste conseguir forçar cache limpo entre casos. */
export function _resetCache() {
  cache = undefined;
}
