"use server";

import { initializeApp } from "firebase-admin/app";
import { getRemoteConfig } from "firebase-admin/remote-config";

console.log("initializing firebase app...");
export const firebaseApp = initializeApp();

// Initialize server-side Remote Config
console.log("initializing server-side Remote Config...");
export const rc = getRemoteConfig(firebaseApp);

console.log("initializing server template...");
export const template = rc.initServerTemplate({
  defaultConfig: {
    streaming_chunk_size: 3,
  },
});
