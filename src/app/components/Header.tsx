/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import AppBar from "@mui/material/AppBar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as _onAuthStateChanged,
  User,
  onAuthStateChanged,
} from "firebase/auth";

import { initializeApp, getApps } from "firebase/app";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseConfig = config;

import { getAuth } from "firebase/auth";
import React, { useEffect, useState } from "react";
export const firebaseApp =
  getApps().length === 0 ? initializeApp(config) : getApps()[0];
export const auth = getAuth(firebaseApp);

function useUserSession(initialUser: any) {
	// The initialUser comes from the server via a server component
	const [user, setUser] = useState(initialUser);
	const router = useRouter();

	// Register the service worker that sends auth state back to server
	// The service worker is built with npm run build-service-worker
	useEffect(() => {
		if ("serviceWorker" in navigator) {
			const serializedFirebaseConfig = encodeURIComponent(JSON.stringify(firebaseConfig));
			const serviceWorkerUrl = `auth-service-worker.js?firebaseConfig=${serializedFirebaseConfig}`
		
		  navigator.serviceWorker
			.register(serviceWorkerUrl)
			.then((registration) => console.log("scope is: ", registration.scope));
		}
	  }, []);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (authUser) => {
			setUser(authUser)
		})

		return () => unsubscribe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		onAuthStateChanged(auth, (authUser) => {
			if (user === undefined) return

			// refresh when user changed to ease testing
			if (user?.email !== authUser?.email) {
				router.refresh()
			}
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user])

	return [user, setUser];
}



export function Header() {
  const [user, setUser] = useUserSession(undefined)
  const pathname = usePathname();

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
  
    try {
      const newUser = await signInWithPopup(auth, provider);
      setUser(newUser.user);
      localStorage.setItem('userUid', newUser.user.uid)
      console.log(newUser.user);
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  }

  const login = (event: { preventDefault: () => void; }) => {
    event.preventDefault();
    signInWithGoogle();
  };

  const logout = (event: { preventDefault: () => void; }): void => {
    signOut(auth);
    localStorage.setItem('userUid', "")
    event.preventDefault();
    setUser(undefined);
  }

  return (
    <AppBar>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Secret Agent
        </Typography>
        {  user ? ( 
        <>
          <p>
            <img className="profileImage" src={user.photoURL || "/profile.svg"} alt={user.email} />
            <Button color="inherit" onClick={logout}>Logout</Button>
          </p>
        </>
        ) : (
          <Button color="inherit" onClick={login}>Login</Button>
        )}

      </Toolbar>
    </AppBar>
  );
}
