import { ArrowLeft, Disc3, LoaderCircle, RefreshCw } from 'lucide-react';

export default function DiskPanel({
  disks,
  copy,
  loading,
  error,
  savingName,
  onClose,
  onRetry,
  onToggle,
}) {
  return (
    <section className="disk-panel" aria-label={copy.diskPanelTitle}>
      <header className="disk-panel-head">
        <button className="disk-back" type="button" onClick={onClose} disabled={Boolean(savingName)} aria-label={copy.diskBack}>
          <ArrowLeft size={18} />
        </button>
        <span>
          <strong>{copy.diskPanelTitle}</strong>
          <small>{copy.diskPanelSubtitle}</small>
        </span>
        <Disc3 size={19} aria-hidden="true" />
      </header>
      {loading ? (
        <div className="disk-panel-state"><LoaderCircle className="disk-spinner" size={22} /><span>{copy.diskLoading}</span></div>
      ) : error ? (
        <div className="disk-panel-state disk-panel-error">
          <span>{error}</span>
          <button type="button" onClick={onRetry}><RefreshCw size={14} />{copy.retry}</button>
        </div>
      ) : disks.length === 0 ? (
        <div className="disk-panel-state"><Disc3 size={22} /><span>{copy.diskNone}</span></div>
      ) : (
        <div className="disk-option-list" role="list">
          {disks.map((disk) => (
            <button
              key={disk.id}
              type="button"
              role="listitem"
              className={`disk-option ${disk.excluded ? 'is-protected' : ''}`}
              disabled={Boolean(savingName)}
              onClick={() => onToggle(disk)}
            >
              <span>
                <strong>{disk.name}</strong>
                <small>{disk.excluded ? copy.diskProtected : copy.diskWillEject}</small>
              </span>
              <span className={`toggle ${disk.excluded ? 'is-on' : ''} ${savingName === disk.name ? 'is-loading' : ''}`} aria-hidden="true"><span /></span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
