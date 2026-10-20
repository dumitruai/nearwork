import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

const backHandlers: { handler: () => boolean; priority: number }[] = [];
export function registerBack(handler: () => boolean, priority = 0) {
  const entry = { handler, priority };
  backHandlers.push(entry);
  return () => { const index = backHandlers.indexOf(entry); if (index >= 0) backHandlers.splice(index, 1); };
}

export function startNative(onResume: () => void) {
  if (Capacitor.getPlatform() !== 'android') return () => {};
  let stopped = false, keyboardVisible = false;
  const handles: PluginListenerHandle[] = [];
  const keep = async (pending: Promise<PluginListenerHandle>) => {
    const handle = await pending;
    if (stopped) await handle.remove();
    else handles.push(handle);
  };
  void keep(Keyboard.addListener('keyboardDidShow', () => { keyboardVisible = true; }));
  void keep(Keyboard.addListener('keyboardDidHide', () => { keyboardVisible = false; }));
  void keep(App.addListener('resume', onResume));
  void keep(App.addListener('backButton', () => {
    if (keyboardVisible) { void Keyboard.hide(); return; }
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) {
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
      return;
    }
    for (const { handler } of [...backHandlers].reverse().sort((a, b) => b.priority - a.priority)) if (handler()) return;
    void App.minimizeApp();
  }));
  return () => { stopped = true; for (const handle of handles) void handle.remove(); };
}
