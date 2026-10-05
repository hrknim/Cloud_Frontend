"use client";

import { useSyncExternalStore } from "react";
import { userSession } from "@/lib/user-session";

// Consumers subscribe only. The header's Userbar starts the initial request.
export function useUserSession() {
  return useSyncExternalStore(userSession.subscribe, userSession.getSnapshot, userSession.getServerSnapshot);
}
