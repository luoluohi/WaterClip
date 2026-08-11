export type WorkspaceShortcut = 'undo' | 'redo' | 'delete' | 'add-group';

interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  target: EventTarget | null;
}

export function resolveWorkspaceShortcut(event: ShortcutEvent): WorkspaceShortcut | undefined {
  const target = event.target instanceof Element ? event.target : undefined;
  if (event.isComposing || target?.closest('input, textarea, select, [contenteditable="true"]')) return undefined;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.key === 'Delete') return 'delete';
  if (event.key === 'Enter' && !target?.closest('button')) return 'add-group';
  return undefined;
}
