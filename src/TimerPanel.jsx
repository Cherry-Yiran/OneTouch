import { ArrowLeft, Check, Clock3 } from 'lucide-react';
import {
  endOfDayDeadline,
  formatTimerRemaining,
  TIMER_PRESETS,
} from './timerModel.js';

export default function TimerPanel({
  controlId,
  title,
  deadline,
  language,
  copy,
  pending,
  onClose,
  onSelect,
}) {
  const options = [
    ...TIMER_PRESETS.map((preset) => ({
      id: preset.id,
      label: copy[`timer${preset.id}`],
      deadline: Date.now() + preset.milliseconds,
    })),
    {
      id: 'today',
      label: copy.timerToday,
      deadline: endOfDayDeadline(),
    },
    {
      id: 'none',
      label: copy.timerNone,
      deadline: null,
    },
  ];

  return (
    <section className="timer-panel" aria-label={`${copy.timerTitle}: ${title}`}>
      <header className="timer-panel-head">
        <button className="timer-back" type="button" onClick={onClose} disabled={pending} aria-label={copy.timerBack}>
          <ArrowLeft size={18} />
        </button>
        <span>
          <strong>{title}</strong>
          <small>{deadline ? formatTimerRemaining(deadline, language) : copy.timerPrompt}</small>
        </span>
        <Clock3 size={19} aria-hidden="true" />
      </header>
      <div className="timer-option-list" role="list">
        {options.map((option) => {
          const isClear = option.id === 'none';
          const selected = isClear ? !deadline : false;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`timer-option ${selected ? 'is-selected' : ''}`}
              disabled={pending}
              onClick={() => onSelect(controlId, option.deadline)}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{isClear ? copy.timerNoneNote : copy.timerTurnsOff}</small>
              </span>
              <span className={`toggle timer-option-toggle ${selected ? 'is-on' : ''}`} aria-hidden="true">
                <span>{pending && !isClear ? null : selected ? <Check size={11} /> : null}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
