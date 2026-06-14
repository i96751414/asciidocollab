import React from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import {
  CurrentUserContext,
  CurrentUserProvider,
  useCurrentUser,
} from '@/contexts/current-user-context';
import type { CurrentUser } from '@/contexts/current-user-context';

const sampleUser: CurrentUser = {
  userId: 'user-123',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
};

/** Wraps children in the provider with {@link sampleUser} for hook-render tests. */
function makeWrapper(user: CurrentUser) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <CurrentUserProvider user={user}>{children}</CurrentUserProvider>;
  };
}

describe('CurrentUserProvider', () => {
  test('renders its children', () => {
    render(
      <CurrentUserProvider user={sampleUser}>
        <span data-testid="child">hi</span>
      </CurrentUserProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('exposes the supplied user through the raw context', () => {
    let observed: CurrentUser | null = null;
    function Consumer() {
      observed = React.useContext(CurrentUserContext);
      return null;
    }
    render(
      <CurrentUserProvider user={sampleUser}>
        <Consumer />
      </CurrentUserProvider>,
    );
    expect(observed).toEqual(sampleUser);
  });
});

describe('useCurrentUser', () => {
  test('returns the user provided by the nearest provider', () => {
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(sampleUser),
    });
    expect(result.current).toEqual(sampleUser);
    expect(result.current.userId).toBe('user-123');
    expect(result.current.displayName).toBe('Ada Lovelace');
    expect(result.current.email).toBe('ada@example.com');
  });

  test('reflects an updated provider value on re-render', () => {
    const nextUser: CurrentUser = {
      userId: 'user-456',
      displayName: 'Grace Hopper',
      email: 'grace@example.com',
    };
    let activeUser = sampleUser;
    function DynamicWrapper({ children }: { children: React.ReactNode }) {
      return <CurrentUserProvider user={activeUser}>{children}</CurrentUserProvider>;
    }
    const { result, rerender } = renderHook(() => useCurrentUser(), {
      wrapper: DynamicWrapper,
    });
    expect(result.current).toEqual(sampleUser);
    activeUser = nextUser;
    rerender();
    expect(result.current).toEqual(nextUser);
  });

  test('throws when used outside a provider', () => {
    expect(() => renderHook(() => useCurrentUser())).toThrow(
      'useCurrentUser must be used within CurrentUserProvider',
    );
  });
});
