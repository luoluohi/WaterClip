import { describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  convertMsczToMusicXml,
  isMusicXmlBuffer,
  isSupportedMuseScoreExecutablePath,
  parseMuseScoreVersion,
  WINDOWS_MUSESCORE_PATHS,
} from '../src/musescore.js';

describe('MuseScore 转换结果判定', () => {
  it('只接受实际的 MusicXML 文档', () => {
    expect(isMusicXmlBuffer(Buffer.from('<?xml version="1.0"?><score-partwise version="4.0"/>'))).toBe(true);
    expect(isMusicXmlBuffer(Buffer.from('<score-timewise/>'))).toBe(true);
    expect(isMusicXmlBuffer(Buffer.from('<html>error</html>'))).toBe(false);
    expect(isMusicXmlBuffer(Buffer.alloc(0))).toBe(false);
  });

  it('进程异常退出但已写出有效文件时仍按转换成功处理', async () => {
    const xml = Buffer.from('<?xml version="1.0"?><score-partwise/>');
    const execImpl = vi.fn(async (_command, args) => {
      await writeFile(String(args[2]), xml);
      throw new Error('GUI teardown failed');
    }) as never;
    const result = await convertMsczToMusicXml({
      bytes: Buffer.from('mscz'),
      filename: 'demo.mscz',
      museScorePath: 'MuseScore4',
      execImpl,
    });
    expect(result).toEqual(xml);
    expect(execImpl).toHaveBeenCalledTimes(1);
  });

  it('首次未产出有效内容时重试，且绝不把无效输出作为成功返回', async () => {
    let attempt = 0;
    const execImpl = vi.fn(async (_command, args) => {
      attempt += 1;
      await writeFile(String(args[2]), attempt === 1 ? '<html>error</html>' : '<score-partwise/>');
    }) as never;
    const result = await convertMsczToMusicXml({
      bytes: Buffer.from('mscz'),
      filename: 'demo.mscz',
      museScorePath: 'MuseScore4',
      execImpl,
    });
    expect(result.toString()).toBe('<score-partwise/>');
    expect(execImpl).toHaveBeenCalledTimes(2);
  });
});

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
