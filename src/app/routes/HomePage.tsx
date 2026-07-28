import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-10 pb-24">
      <h1 className="text-heading font-bold">{t('home.title')}</h1>
      <p className="text-body-sm text-fg-tertiary">{t('home.empty')}</p>
    </main>
  );
}
