"use client";

import { createContext, useContext } from "react";

/** Represents the authenticated user's identity information available throughout the app. */
export interface CurrentUser {
  /** The unique identifier of the authenticated user. */
  userId: string;
  /** The human-readable display name of the authenticated user. */
  displayName: string;
  /** The email address of the authenticated user. */
  email: string;
  /** DiceBear avatar key ("style" or "style:variant"), or null for the default style. */
  avatarKey: string | null;
}

export const CurrentUserContext = createContext<CurrentUser | null>(null);

interface CurrentUserProviderProperties {
  user: CurrentUser;
  children: React.ReactNode;
}

/** Provides the current authenticated user via context to all descendant components. */
export function CurrentUserProvider({ user, children }: CurrentUserProviderProperties) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

/** Returns the current authenticated user from context, throwing if used outside a provider. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return user;
}
