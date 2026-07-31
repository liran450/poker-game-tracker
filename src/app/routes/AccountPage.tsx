import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AppShell } from '@components/AppShell';
import { Banner } from '@components/Banner';
import { Button } from '@components/shared/Button';
import { Card } from '@components/shared/Card';
import { IconButton } from '@components/shared/IconButton';
import { TextField } from '@components/shared/TextField';
import { UsernameTakenError } from '@data/profiles';
import { useSession, type SessionContextValue } from '../../hooks/useSession';

/**
 * The screen map's "Profile" node (04-ux-spec.md#screen-map) has no mockup
 * behind it — `docs/11`'s "what the design does not cover" list doesn't name
 * a sign-in screen either. Built in the established visual language (same
 * card/token/spacing conventions as every other screen) per CLAUDE.md's
 * "extend it yourself, review afterward" working style. One route, three
 * states, rather than three separate pages: signed out, signed in but
 * without a `profiles` row yet, and fully signed in — there's no navigation
 * between them, only a state transition on the same screen.
 */
export function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2 px-2 py-3">
          <IconButton label={t('game.backToHome')} onClick={() => void navigate('/')}>
            {'✕'}
          </IconButton>
          <h1 className="text-heading font-bold">{t('account.title')}</h1>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {!session.cloudConfigured ? (
          <Banner variant="info">{t('auth.notConfigured')}</Banner>
        ) : session.loading ? null : session.user === null ? (
          <SignInForm session={session} />
        ) : session.needsProfile ? (
          <ProfileSetupForm session={session} />
        ) : (
          <SignedInPanel session={session} />
        )}
      </div>
    </AppShell>
  );
}

function SignInForm({ session }: { session: SessionContextValue }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle(): Promise<void> {
    setError(null);
    try {
      await session.signInWithGoogle();
    } catch {
      setError(t('auth.genericError'));
    }
  }

  async function handleMagicLink(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await session.signInWithMagicLink(email);
      setSentTo(email);
    } catch {
      setError(t('auth.genericError'));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-title font-bold">{t('auth.title')}</h2>
        <p className="text-body-sm text-fg-tertiary">{t('auth.subtitle')}</p>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      {sentTo ? (
        <Banner variant="success">{t('auth.magicLinkSent', { email: sentTo })}</Banner>
      ) : (
        <>
          <Button variant="primary" fullWidth onClick={() => void handleGoogle()}>
            {t('auth.google')}
          </Button>
          <div className="flex items-center gap-2 text-caption text-fg-disabled">
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>
          <form className="flex flex-col gap-3" onSubmit={(event) => void handleMagicLink(event)}>
            <label className="flex flex-col gap-1.5 text-body-sm font-semibold text-fg-secondary">
              {t('auth.emailLabel')}
              <TextField
                type="email"
                required
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <Button variant="secondary" type="submit" fullWidth>
              {t('auth.sendMagicLink')}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

function ProfileSetupForm({ session }: { session: SessionContextValue }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await session.createProfile({ username, displayName, defaultNickname: nickname.trim() || null });
    } catch (err) {
      setError(
        err instanceof UsernameTakenError
          ? t('profileSetup.usernameTaken', { username: err.username })
          : t('auth.genericError'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-title font-bold">{t('profileSetup.title')}</h2>
        <p className="text-body-sm text-fg-tertiary">{t('profileSetup.subtitle')}</p>
      </div>

      {error && <Banner variant="error">{error}</Banner>}

      <form className="flex flex-col gap-3" onSubmit={(event) => void handleSubmit(event)}>
        <label className="flex flex-col gap-1.5 text-body-sm font-semibold text-fg-secondary">
          {t('profileSetup.usernameLabel')}
          <TextField
            required
            minLength={3}
            maxLength={24}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body-sm font-semibold text-fg-secondary">
          {t('profileSetup.displayNameLabel')}
          <TextField
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body-sm font-semibold text-fg-secondary">
          {t('profileSetup.nicknameLabel')}
          <TextField value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <Button variant="primary" type="submit" fullWidth disabled={saving}>
          {t('profileSetup.save')}
        </Button>
      </form>
    </Card>
  );
}

function SignedInPanel({ session }: { session: SessionContextValue }) {
  const { t } = useTranslation();
  const profile = session.profile;
  if (!profile) return null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <p className="text-body font-semibold">{t('account.signedInAs', { name: profile.displayName })}</p>
        <p className="text-body-sm text-fg-tertiary">
          {t('account.usernameLine', { username: profile.username })}
        </p>
      </div>
      <Button variant="secondary" onClick={() => void session.signOut()}>
        {t('account.signOut')}
      </Button>
    </Card>
  );
}
