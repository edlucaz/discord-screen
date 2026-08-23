/**
 * O AudioContext compartilhado entre transmissões.
 *
 * O que se testa aqui não é a reprodução do som — isso pede um dispositivo de
 * áudio de verdade — é que duas transmissões com som não abrem dois contextos,
 * e que parar uma não leva a outra junto. Um AudioContext de mentira, com só
 * os métodos que audio.js chama, cobre os dois.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from './audio.js';

let contextosCriados = [];

class GanhoFalso {
  constructor(ctx) {
    this.context = ctx;
    this.gain = { value: 1, setTargetAtTime: vi.fn() };
    this.destino = null;
  }
  connect(destino) {
    this.destino = destino;
  }
  disconnect() {
    this.destino = null;
  }
}

class AudioContextFalso {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.fechado = false;
    contextosCriados.push(this);
  }
  createGain() {
    return new GanhoFalso(this);
  }
  createBuffer(canais, frames, sampleRate) {
    return { duration: frames / sampleRate, getChannelData: () => new Float32Array(frames) };
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.fechado = true;
    return Promise.resolve();
  }
}

class AudioDecoderFalso {
  constructor({ output }) {
    this.output = output;
    this.state = 'unconfigured';
  }
  configure() {
    this.state = 'configured';
  }
  decode() {
    this.output({
      numberOfChannels: 1,
      numberOfFrames: 960,
      sampleRate: 48_000,
      copyTo: () => {},
      close: vi.fn(),
    });
  }
  close() {
    this.state = 'closed';
  }
}

function pacote() {
  const buffer = new ArrayBuffer(20);
  new DataView(buffer).setFloat64(2, 0);
  return buffer;
}

beforeEach(() => {
  contextosCriados = [];

  globalThis.AudioContext = AudioContextFalso;
  globalThis.AudioDecoder = AudioDecoderFalso;
  globalThis.EncodedAudioChunk = class {
    constructor(init) {
      Object.assign(this, init);
    }
  };
  globalThis.window = { AudioContext: AudioContextFalso, AudioDecoder: AudioDecoderFalso };
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete globalThis.window;
  // Redefine o módulo entre testes: o contexto compartilhado vive numa
  // variável de módulo, e sem isto o segundo teste herdaria o do primeiro.
  vi.resetModules();
});

const config = () => ({ codec: 'opus', sampleRate: 48_000, numberOfChannels: 1 });

describe('AudioContext compartilhado', () => {
  it('duas transmissões com som usam o mesmo contexto', async () => {
    const { createAudio: novoCreateAudio } = await import('./audio.js');
    const a = novoCreateAudio({});
    const b = novoCreateAudio({});

    expect(a.start(config())).toBe(true);
    expect(b.start(config())).toBe(true);

    expect(contextosCriados).toHaveLength(1);
  });

  it('parar uma transmissão não fecha o contexto nem tira o som da outra', async () => {
    const { createAudio: novoCreateAudio } = await import('./audio.js');
    const a = novoCreateAudio({});
    const b = novoCreateAudio({});
    a.start(config());
    b.start(config());

    a.stop();

    expect(contextosCriados[0].fechado).toBe(false);
    // b continua funcionando: empurrar um pacote não deve lançar.
    expect(() => b.push(pacote())).not.toThrow();
  });

  it('sem ninguém pedindo som, nenhum contexto é criado', async () => {
    const { createAudio: novoCreateAudio } = await import('./audio.js');
    novoCreateAudio({});

    expect(contextosCriados).toHaveLength(0);
  });
});

describe('createAudio', () => {
  it('start() falha sem derrubar quem chamou, quando falta WebCodecs', async () => {
    delete globalThis.window.AudioDecoder;
    const onError = vi.fn();
    const a = createAudio({ onError });

    expect(a.start(config())).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});
