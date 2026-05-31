"use client";

import { useState, useCallback, useRef } from "react";
import { usersApi, UserSearchResult } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface UserSearchComboboxProperties {
  projectId: string;
  value: UserSearchResult | null;
  onChange: (user: UserSearchResult | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 *
 */
export function UserSearchCombobox({
  projectId,
  value,
  onChange,
  placeholder = "Search by name or email…",
  disabled = false,
}: UserSearchComboboxProperties) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (debounceReference.current) clearTimeout(debounceReference.current);
      if (q.length < 2) { setResults([]); setOpen(false); return; }
      debounceReference.current = setTimeout(async () => {
        setLoading(true);
        try {
          const response = await usersApi.search(q, projectId);
          setResults(response.data.users);
          setOpen(true);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [projectId],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const q = event.target.value;
    setQuery(q);
    if (value) onChange(null);
    search(q);
  };

  const handleSelect = (user: UserSearchResult) => {
    onChange(user);
    setQuery(user.displayName);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <Input
        value={value ? `${value.displayName} (${value.email})` : query}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {loading && (
            <p className="p-2 text-sm text-muted-foreground">Searching…</p>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <p className="p-2 text-sm text-muted-foreground">No users found</p>
          )}
          {!loading && results.map((user) => (
            <button
              key={user.userId}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              onMouseDown={() => handleSelect(user)}
            >
              <span className="font-medium">{user.displayName}</span>
              <span className="ml-2 text-muted-foreground">{user.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
