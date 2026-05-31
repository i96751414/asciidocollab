"use client";

import { createContext, useContext } from "react";

/**
 *
 */
export interface CurrentUser {
  /**
   *
   */
  userId: string;
  /**
   *
   */
  displayName: string;
  /**
   *
   */
  email: string;
}

export const CurrentUserContext = createContext<CurrentUser | null>(null);

interface CurrentUserProviderProperties {
  user: CurrentUser;
  children: React.ReactNode;
}

/**
 *
 */
export function CurrentUserProvider({ user, children }: CurrentUserProviderProperties) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

/**
 *
 */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return user;
}
