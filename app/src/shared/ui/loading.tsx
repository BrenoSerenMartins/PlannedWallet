import './loading.css';

type Layout = 'list' | 'form' | 'balance' | 'summary' | 'planning' | 'cards' | 'chart';

export function Loading({ layout = 'list' }: { layout?: Layout }) {
  const list = layout === 'list';
  const form = layout === 'form';
  return (
    <div
      className={`loading hud-loading hud-loading-${layout}`}
      role="status"
      aria-label="Carregando"
    >
      <div className="hud-loading-content" aria-hidden="true">
        {list || form ? (
          [0, 1, 2].map((index) => (
            <div className="hud-loading-row" key={index}>
              {list && <span className="hud-placeholder hud-loading-icon" />}
              <div className="hud-loading-copy">
                <span className="hud-placeholder hud-loading-label" />
                <span
                  className={`hud-placeholder ${form ? 'hud-loading-field' : 'hud-loading-meta'}`}
                />
              </div>
              {list && <span className="hud-placeholder hud-loading-amount" />}
            </div>
          ))
        ) : layout === 'chart' ? (
          <>
            <span className="hud-placeholder hud-loading-label" />
            <div className="hud-loading-bars">
              {[38, 56, 48, 74, 62, 90].map((height) => (
                <span className="hud-placeholder" key={height} style={{ height: `${height}%` }} />
              ))}
            </div>
          </>
        ) : (
          <>
            {layout !== 'summary' && (
              <div className="hud-loading-hero">
                <span className="hud-placeholder hud-loading-label" />
                <span className="hud-placeholder hud-loading-value" />
                <span className="hud-placeholder hud-loading-meter" />
              </div>
            )}
            {layout !== 'balance' && (
              <div className="hud-loading-pair">
                {[0, 1].map((index) => (
                  <div className="hud-loading-metric" key={index}>
                    <span className="hud-placeholder hud-loading-label" />
                    <span className="hud-placeholder hud-loading-value" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
