import { useEffect, useRef } from 'react';
import {
  endOfDayDeadline,
  TIMER_PRESETS,
} from './timerModel.js';

export default function TimerPanel({
  controlId,
  anchor,
  copy,
  onClose,
  onSelect,
}) {
  const popoverRef = useRef(null);
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

  useEffect(() => {
    const dismissFromPointer = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      if (event.target.closest?.(`[data-timer-trigger="${controlId}"]`)) return;
      onClose();
    };
    const dismissFromKeyboard = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    const dismissFromViewportChange = () => onClose();
    const switchList = document.querySelector('.switch-list');

    document.addEventListener('pointerdown', dismissFromPointer);
    document.addEventListener('keydown', dismissFromKeyboard);
    window.addEventListener('resize', dismissFromViewportChange);
    switchList?.addEventListener('scroll', dismissFromViewportChange, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismissFromPointer);
      document.removeEventListener('keydown', dismissFromKeyboard);
      window.removeEventListener('resize', dismissFromViewportChange);
      switchList?.removeEventListener('scroll', dismissFromViewportChange);
    };
  }, [controlId, onClose]);

  return (
    <div
      ref={popoverRef}
      id={`timer-popover-${controlId}`}
      className={`timer-popover is-${anchor.placement}`}
      style={{ top: anchor.top, left: anchor.left }}
      role="menu"
      aria-label={copy.timerPrompt}
    >
      <span className="timer-popover-label">{copy.timerPrompt}</span>
      <div className="timer-popover-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            className={`timer-popover-option ${option.id === 'none' ? 'is-indefinite' : ''}`}
            onClick={() => onSelect(controlId, option.deadline)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
