import type { ReactNode } from 'react';

/** Shared page hierarchy: title first, one quiet description and task actions. */
export function PageHeader({
  title,
  description,
  navigation,
  children,
  compact = false,
  route = false,
  className = '',
  titleLabel,
}: {
  title: ReactNode;
  compact?: boolean;
  route?: boolean;
  className?: string;
  titleLabel?: string;
  description?: ReactNode;
  navigation?: ReactNode;
  children?: ReactNode;
}) {
  if (compact && !route && !navigation && !children) return <h1 className="sr-only">{title}</h1>;
  return (
    <header
      className={`page-heading page-header${compact ? ' page-header-compact' : ''}${route ? ' route-page-header' : ''} ${className}`}
    >
      <div className="page-header-copy">
        <div className="page-header-headingline">
          <h1 aria-label={titleLabel} className={compact && !route ? 'sr-only' : undefined}>
            {title}
          </h1>
          {navigation}
        </div>
        {description && !compact && <p>{description}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}
