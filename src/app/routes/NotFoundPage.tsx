import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start gap-4 px-4 pt-10">
      <h1 className="text-heading font-bold">{t('notFound.title')}</h1>
      <Link to="/" className="text-body font-semibold">
        {t('notFound.back')}
      </Link>
    </main>
  );
}
