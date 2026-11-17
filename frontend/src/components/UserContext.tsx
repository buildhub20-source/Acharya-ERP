"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type Role = "MANAGER" | "OFFICIAL" | "ADMIN";

export interface AppUser {
  name: string;
  role: Role;
  title: string;
}

/** Mock users until Supabase Auth is wired in. */
export const USERS: AppUser[] = [
  { name: "Mrs. Anitha (Store Manager)", role: "MANAGER", title: "Store Manager" },
  { name: "Dr. Meenakshi (Principal)", role: "OFFICIAL", title: "Principal" },
  { name: "Mr. Ravi (Procurement Admin)", role: "ADMIN", title: "Procurement Admin" },
];

const KEY = "erp-user";
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return localStorage.getItem(KEY) ?? USERS[0].name;
  } catch {
    return USERS[0].name;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const Ctx = createContext<{ user: AppUser; setUser: (u: AppUser) => void }>({
  user: USERS[0],
  setUser: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  // Server snapshot = default user, so hydration matches; React then re-renders with the stored user.
  const name = useSyncExternalStore(subscribe, readStored, () => USERS[0].name);
  const user = USERS.find((u) => u.name === name) ?? USERS[0];

  const setUser = useCallback((u: AppUser) => {
    try {
      localStorage.setItem(KEY, u.name);
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  }, []);

  return <Ctx.Provider value={{ user, setUser }}>{children}</Ctx.Provider>;
}

export const useUser = () => useContext(Ctx);
