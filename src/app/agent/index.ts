import { genkitPlugin, PluginProvider } from '@genkit-ai/core';

export * from './agents';
export * from './memory';
export * from './types';

export function firebaseAgent(): PluginProvider {
  const plugin = genkitPlugin('firebase-agent', async (): Promise<void> => {});
  return plugin();
}
