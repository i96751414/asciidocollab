'use client';
import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** React hook that fetches the current user's key bindings for a given namespace as an action-to-keyCombo map. */
export function useKeyBindings(namespace: string): Map<string, string> {
  const [bindings, setBindings] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch(`${API_BASE}/auth/me/keybindings?namespace=${encodeURIComponent(namespace)}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ action: string; keyCombo: string }>) => {
        setBindings(new Map(data.map((b) => [b.action, b.keyCombo])));
      })
      .catch(() => {});
  }, [namespace]);

  return bindings;
}
