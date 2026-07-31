import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  getCurrentUser,
  isCloudConfigured,
  onAuthUserChange,
  signInWithGoogle,
  signInWithMagicLink,
  signOut as authSignOut,
  type AppUser,
} from '@data/auth';
import { migrateAllLocalGames } from '@data/localGameMigration';
import { createProfile, getProfile, type CreateProfileInput, type Profile } from '@data/profiles';
import { setCurrentProfileId } from '@core/offline/localIdentity';

export interface SessionContextValue {
  /** Whether this build even has `VITE_SUPABASE_*` wired in — false in every environment without it. */
  readonly cloudConfigured: boolean;
  /** True only while the very first session check is in flight, never again after. */
  readonly loading: boolean;
  readonly user: AppUser | null;
  readonly profile: Profile | null;
  /** Signed in, but `profiles` has no row for this user yet — the profile-setup flow's cue. */
  readonly needsProfile: boolean;
  signInWithGoogle(): Promise<void>;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  createProfile(input: Omit<CreateProfileInput, 'id'>): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * The one place `core/offline`'s "which id do new events get stamped with"
 * (`setCurrentProfileId`) and "which local games need pushing"
 * (`migrateAllLocalGames`) are driven from a real auth session (PLAN.md step
 * 12). `migratedForUserId` guards against re-running the migration sweep on
 * every re-render/remount for a user already migrated this session — each
 * step it calls is independently idempotent anyway, but there's no reason to
 * redo the whole local-games scan every time.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const cloudConfigured = isCloudConfigured();
  const [loading, setLoading] = useState(cloudConfigured);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const migratedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!cloudConfigured) return;
    const cancelledRef = { current: false };

    async function syncProfile(currentUser: AppUser): Promise<void> {
      const found = await getProfile(currentUser.id);
      if (cancelledRef.current) return;
      setProfile(found);
      if (found) await adoptProfile(found);
    }

    async function adoptProfile(adopted: Profile): Promise<void> {
      await setCurrentProfileId(adopted.id);
      if (migratedForUserId.current !== adopted.id) {
        migratedForUserId.current = adopted.id;
        void migrateAllLocalGames(adopted.id);
      }
    }

    void (async () => {
      const initialUser = await getCurrentUser();
      if (cancelledRef.current) return;
      setUser(initialUser);
      if (initialUser) await syncProfile(initialUser);
      // Not actually dead: the type checker sees no assignment to
      // `cancelledRef.current` reachable from *this* closure, since the only
      // one is in the effect's cleanup — a different closure, invoked by
      // React on unmount, that this static analysis can't see interleaving
      // with the `await` above. The guard is real at runtime (a fast
      // unmount-then-remount can absolutely land here after cleanup ran).
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelledRef.current) return;
      setLoading(false);
    })();

    const unsubscribe = onAuthUserChange((nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        void syncProfile(nextUser);
      } else {
        setProfile(null);
        migratedForUserId.current = null;
        void setCurrentProfileId(null);
      }
    });

    return () => {
      cancelledRef.current = true;
      unsubscribe();
    };
  }, [cloudConfigured]);

  const value: SessionContextValue = {
    cloudConfigured,
    loading,
    user,
    profile,
    needsProfile: !loading && user !== null && profile === null,
    signInWithGoogle: () => signInWithGoogle(),
    signInWithMagicLink: (email) => signInWithMagicLink(email),
    signOut: () => authSignOut(),
    async createProfile(input) {
      if (!user) throw new Error('createProfile: no signed-in user');
      const created = await createProfile({ id: user.id, ...input });
      setProfile(created);
      await setCurrentProfileId(created.id);
      if (migratedForUserId.current !== created.id) {
        migratedForUserId.current = created.id;
        void migrateAllLocalGames(created.id);
      }
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider/context, not in a separate file for one export
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
