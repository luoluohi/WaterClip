import { describe, expect, it } from 'vitest';
import { browserUrl, resolveStaticRoot } from '../src/runtime.js';
import { resolve } from 'node:path';

describe('便携版运行时配置', () => {
  it('优先使用发布器显式提供的静态目录', () => {
    expect(resolveStaticRoot(import.meta.url, 'C:\\WaterClip\\app\\web'))
      .toBe(resolve('C:\\WaterClip\\app\\web'));
  });

  it('监听所有网卡时仍只打开本机浏览地址', () => {
    expect(browserUrl('0.0.0.0', 4174)).toBe('http://127.0.0.1:4174');
    expect(browserUrl('127.0.0.1', 4174)).toBe('http://127.0.0.1:4174');
  });
});
