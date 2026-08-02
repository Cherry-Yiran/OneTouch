import {
  Check,
  ChevronLeft,
  LoaderCircle,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import { primaryDisplay } from './resolutionModel.js';

export default function ResolutionPanel({
  copy,
  configuration,
  selectedDisplayId,
  loading,
  error,
  pendingModeKey,
  closing = false,
  onClose,
  onRetry,
  onSelectDisplay,
  onSelectMode,
}) {
  const displays = configuration?.displays || [];
  const display = displays.find((item) => item.id === selectedDisplayId)
    || primaryDisplay(configuration);
  const modes = display?.modes || [];

  return (
    <section className={`resolution-panel secondary-panel ${closing ? 'is-closing' : ''}`} aria-label={copy.resolutionPanelTitle}>
      <header className="resolution-panel-head">
        <button
          type="button"
          className="resolution-back"
          onClick={onClose}
          aria-label={copy.resolutionBack}
          autoFocus
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span>
          <strong>{copy.resolutionPanelTitle}</strong>
          <small>{display?.name || copy.resolutionNoDisplay}</small>
        </span>
      </header>

      {loading && (
        <div className="resolution-state" role="status">
          <LoaderCircle className="resolution-spinner" size={23} />
          <span>{copy.resolutionLoading}</span>
        </div>
      )}

      {!loading && error && (
        <div className="resolution-state resolution-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            <RefreshCw size={16} />
            {copy.retry}
          </button>
        </div>
      )}

      {!loading && !error && displays.length > 1 && (
        <div className="resolution-displays" role="tablist" aria-label={copy.resolutionDisplays}>
          {displays.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={display?.id === item.id}
              className={display?.id === item.id ? 'is-selected' : ''}
              onClick={() => onSelectDisplay(item.id)}
            >
              <Monitor size={15} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && display && modes.length > 0 && (
        <div className="resolution-options" role="listbox" aria-label={copy.resolutionOptions}>
          {modes.map((mode) => {
            const key = `${display.id}:${mode.id}`;
            const pending = pendingModeKey === key;
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={mode.current}
                className={mode.current ? 'is-current' : ''}
                disabled={Boolean(pendingModeKey) || mode.current}
                onClick={() => onSelectMode(display.id, mode)}
              >
                <span className="resolution-mode-copy">
                  <strong>{mode.width} × {mode.height}</strong>
                  <small>{mode.hiDpi ? copy.resolutionHiDpi : copy.resolutionStandard}</small>
                </span>
                <span className="resolution-mode-state" aria-hidden="true">
                  {pending
                    ? <LoaderCircle className="resolution-spinner" size={18} />
                    : mode.current
                      ? <Check size={18} strokeWidth={2} />
                      : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && (!display || modes.length === 0) && (
        <div className="resolution-state" role="status">{copy.resolutionNoModes}</div>
      )}
    </section>
  );
}
