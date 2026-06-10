'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { User, Settings, ShieldCheck, ScrollText, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { authApi } from '@/lib/api';

interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
  avatarKey: string | null;
  appTheme: string;
}

interface UserMenuProperties {
  profile: UserProfile;
}

/** GitHub mark (lucide dropped brand icons); sized to match the lucide menu icons. */
function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Dropdown menu in the sidebar header exposing account, theme, and sign-out actions. */
export function UserMenu({ profile }: UserMenuProperties) {
  const router = useRouter();

  async function handleLogOut() {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    router.push('/login');
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
          <Avatar avatarKey={profile.avatarKey} displayName={profile.displayName} size={28} />
          <span className="text-sm font-medium">{profile.displayName}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md" align="end">
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/account" className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground">
              <User className="h-4 w-4 shrink-0" />
              Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/settings" className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground">
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>
          </DropdownMenu.Item>

          {profile.isAdmin && (
            <>
              <DropdownMenu.Separator className="my-1 border-t" />
              <DropdownMenu.Item asChild>
                <Link href="/dashboard/admin" className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Administrator Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/dashboard/admin/audit-log" className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground">
                  <ScrollText className="h-4 w-4 shrink-0" />
                  Audit Log
                </Link>
              </DropdownMenu.Item>
            </>
          )}

          <DropdownMenu.Separator className="my-1 border-t" />
          <DropdownMenu.Item asChild>
            <a
              href="https://github.com/joaoleal/asciidocollab"
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <GithubIcon />
              GitHub
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            onSelect={handleLogOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log Out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
