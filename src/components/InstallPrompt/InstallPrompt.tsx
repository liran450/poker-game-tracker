import { useTranslation } from 'react-i18next';
import { Banner } from '@components/Banner';
import { Button } from '@components/shared/Button';

export interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

/**
 * The "Add to Home Screen" nudge (docs/build/PLAN.md#step-9), surfaced once
 * a completed game exists to trigger it — a finished summary screen is the
 * moment someone's most likely to think "I'll want this again next week."
 * Chromium/Android only; see `useInstallPrompt`.
 */
export function InstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  const { t } = useTranslation();

  return (
    <Banner
      variant="info"
      action={
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {t('install.dismiss')}
          </Button>
          <Button variant="primary" size="sm" onClick={onInstall}>
            {t('install.action')}
          </Button>
        </div>
      }
    >
      <span className="flex flex-col">
        <span className="font-bold">{t('install.title')}</span>
        <span className="font-normal">{t('install.body')}</span>
      </span>
    </Banner>
  );
}
