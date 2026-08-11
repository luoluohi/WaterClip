import { describe, expect, it } from 'vitest';
import { resolveWorkspaceShortcut } from './keyboard';

function shortcut(key: string, target: EventTarget = document.body, patch: Partial<KeyboardEvent> = {}) {
  return resolveWorkspaceShortcut({
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...patch
  });
}

describe('workspace keyboard shortcuts', () => {
  it('resolves undo, redo and selected-group deletion commands', () => {
    expect(shortcut('z', document.body, { ctrlKey: true })).toBe('undo');
    expect(shortcut('Z', document.body, { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(shortcut('Delete')).toBe('delete');
  });

  it('does not intercept native editing shortcuts inside form and editable fields', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const nested = document.createElement('span');
    editable.append(nested);

    expect(shortcut('z', input, { ctrlKey: true })).toBeUndefined();
    expect(shortcut('Delete', textarea)).toBeUndefined();
    expect(shortcut('z', nested, { ctrlKey: true, shiftKey: true })).toBeUndefined();
  });
});
