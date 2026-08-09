import { describe, expect, it } from 'vitest';
import { WINDOWS_MUSESCORE_PATHS } from '../src/musescore.js';

describe('MuseScore 探测路径', () => {
  it('优先包含用户机器上的 MuseScore Studio 4 安装路径', () => {
    expect(WINDOWS_MUSESCORE_PATHS[0]).toBe('C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe');
  });
});
