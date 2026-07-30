import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUyMOriFFKSIgORjSgvTLnxYNPBGmIsk8",
  authDomain: "project-audio-c3512.firebaseapp.com",
  projectId: "project-audio-c3512",
  storageBucket: "project-audio-c3512.firebasestorage.app",
  messagingSenderId: "1064696916955",
  appId: "1:1064696916955:web:38007cffb8fc1624c055fe",
  measurementId: "G-X7D3WVH914"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
