import { describe, expect, it } from 'vitest';
import {
  isSupportedMuseScoreExecutablePath,
  parseMuseScoreVersion,
  WINDOWS_MUSESCORE_PATHS,
} from '../src/musescore.js';

describe('MuseScore 探测路径', () => {
  it('优先包含用户机器上的 MuseScore Studio 4 安装路径', () => {
    expect(WINDOWS_MUSESCORE_PATHS[0]).toBe('C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe');
  });
});

describe('MuseScore 显式路径校验', () => {
  it('只接受绝对路径中的已知 MuseScore 可执行文件名', () => {
    expect(isSupportedMuseScoreExecutablePath('C:\\Tools\\MuseScore4.exe')).toBe(true);
    expect(isSupportedMuseScoreExecutablePath('C:\\Tools\\MuseScoreStudio4.exe')).toBe(true);
    expect(isSupportedMuseScoreExecutablePath('MuseScore4.exe')).toBe(false);
    expect(isSupportedMuseScoreExecutablePath('C:\\Tools\\notepad.exe')).toBe(false);
  });

  it('只认可 MuseScore 4 的版本输出', () => {
    expect(parseMuseScoreVersion('MuseScore 4.7.4')).toBe('MuseScore 4.7.4');
    expect(parseMuseScoreVersion('MuseScore 3.6.2')).toBeNull();
    expect(parseMuseScoreVersion('Unrelated Tool 4.7.4')).toBeNull();
  });
});
