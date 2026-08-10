import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface User {
  name: string;
  email: string;
  avatar: string;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let avatar = firebaseUser.photoURL || '';
        
        if (firebaseUser.displayName) {
          try {
            const usernameDoc = await getDoc(doc(db, "usernames", firebaseUser.displayName.toLowerCase().trim()));
            if (usernameDoc.exists() && usernameDoc.data().photoURL) {
              avatar = usernameDoc.data().photoURL;
            }
          } catch (err) {
            console.error("Error fetching avatar from Firestore:", err);
          }
        }

        setUser({
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          avatar: avatar,
        });
        setIsLoggedIn(true);
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  const reloadUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      
      let avatar = auth.currentUser.photoURL || '';
      if (auth.currentUser.displayName) {
        try {
          const usernameDoc = await getDoc(doc(db, "usernames", auth.currentUser.displayName.toLowerCase().trim()));
          if (usernameDoc.exists() && usernameDoc.data().photoURL) {
            avatar = usernameDoc.data().photoURL;
          }
        } catch (err) {
          console.error("Error fetching avatar from Firestore:", err);
        }
      }

      setUser({
        name: auth.currentUser.displayName || 'User',
        email: auth.currentUser.email || '',
        avatar: avatar,
      });
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, logout, reloadUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
