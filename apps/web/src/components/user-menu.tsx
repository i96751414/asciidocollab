'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
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
            <Link href="/dashboard/account" className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground block">
              Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/settings" className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground block">
              Settings
            </Link>
          </DropdownMenu.Item>

          {profile.isAdmin && (
            <>
              <DropdownMenu.Separator className="my-1 border-t" />
              <DropdownMenu.Item asChild>
                <Link href="/dashboard/admin" className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground block">
                  Administrator Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/dashboard/admin/audit-log" className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground block">
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
              className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground block"
            >
              GitHub
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="cursor-pointer rounded px-2 py-1 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            onSelect={handleLogOut}
          >
            Log Out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
