import { initializeApp } from "firebase/app";
import { getAuth, getIdToken } from "firebase/auth";
import { getInstallations, getToken } from "firebase/installations";

let app;
let auth;
let installations;

self.addEventListener("install", (installEvent) => {
  const serializedFirebaseConfig = new URL(location).searchParams.get(
    "firebaseConfig",
  );
  if (!serializedFirebaseConfig) {
    throw new Error(
      "Firebase Config object not found in service worker query string.",
    );
  }

  const firebaseConfig = JSON.parse(serializedFirebaseConfig);
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  installations = getInstallations(app);
  console.log("Service worker installed with Firebase config", firebaseConfig);
});

self.addEventListener("fetch", (fetchEvent) => {
  if (!app) {
    // Not installed yet
    return;
  }
  if (!auth) {
    auth = getAuth(app);
  }
  const { origin } = new URL(fetchEvent.request.url);
  if (origin !== self.location.origin) {
    // Ignoring request to any other origin
    return;
  }

  // Intercept the fetch and add Firebase headers
  const promise = Promise.all([
    getAuthIdToken(auth),
    getToken(installations),
  ]).then(([authIdToken, installationToken]) => {
    const headers = new Headers(fetchEvent.request.headers);
    if (installationToken) {
      // Should be sent in all cases
      headers.append("Firebase-Instance-ID-Token", installationToken);
    }
    if (authIdToken) {
      // Sent only when user is logged in
      headers.append("Authorization", `Bearer ${authIdToken}`);
    }
    const newRequest = new Request(fetchEvent.request, { headers });
    return fetch(newRequest);
  });

  fetchEvent.respondWith(promise);
});

async function getAuthIdToken(auth) {
  await auth.authStateReady();
  if (auth.currentUser) {
    return await getIdToken(auth.currentUser);
  }
}
