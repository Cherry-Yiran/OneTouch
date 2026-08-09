import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  ChevronDown,
  GripVertical,
  Info,
  Keyboard,
  Settings2,
  SlidersHorizontal,
  ToggleRight,
  X,
} from 'lucide-react';
import { reorderControlByOffset } from './reorder';
import { validateNativeGlobalShortcut } from './nativeBridge.js';
import {
  conflictingShortcutId,
  formatShortcut,
  shortcutFromKeyboardEvent,
} from './shortcutModel.js';
import { toggleVisibleControl } from './visibility.js';

const SORT_TRANSITION = {
  duration: 210,
  easing: 'cubic-bezier(.2,.8,.2,1)',
};

const DROP_ANIMATION = {
  duration: 190,
  easing: 'cubic-bezier(.2,.8,.2,1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0',
      },
    },
  }),
};

export const PREFERENCES_COPY = {
  en: {
    title: 'Preferences',
    general: 'General',
    customise: 'Customise',
    shortcuts: 'Shortcuts',
    about: 'About',
    close: 'Close preferences',
    language: 'Language',
    startAtLogin: 'Start at login',
    startAtLoginNote: 'Keep OneTouch ready in the menu bar.',
    autostartError: 'Could not update the login setting.',
    saved: 'Changes are saved on this Mac.',
    activeMenu: 'Visible in menu',
    customiseIntro: 'Choose controls to show and drag to arrange them.',
    visibleCount: '%ld selected',
    searchControls: 'Search controls',
    detailTitle: 'Control details',
    detailEmpty: 'Select a control to see its status-menu configuration.',
    reorder: 'Drag to reorder',
    enabledNote: 'This control is shown in the status menu.',
    disabledNote: 'This control is hidden until you enable it.',
    controlToggle: 'Persistent switch',
    controlAction: 'One-time action',
    controlChoice: 'In-app selection',
    controlSettings: 'Opens System Settings',
    shortcutIntro: 'Assign an optional global shortcut to any control. Nothing is registered until you record it.',
    shortcutRecord: 'Record',
    shortcutRecording: 'Press shortcut…',
    shortcutClear: 'Clear shortcut',
    shortcutHint: 'Use ⌘, ⌃ or ⌥ with another key. Press Delete to clear; Esc cancels.',
    shortcutNeedsModifier: 'Add Command, Control or Option so normal typing is never captured.',
    shortcutNeedsKey: 'Press a non-modifier key as part of the shortcut.',
    shortcutDuplicate: 'That shortcut is already assigned to another control.',
    shortcutUnavailable: 'That shortcut is already used by macOS or another app.',
    shortcutSaved: 'Shortcut saved.',
    aboutTitle: 'OneTouch',
    version: 'Version %@',
    github: 'GitHub',
    githubPending: 'GitHub link coming soon',
    x: 'X @hizhm1',
    xPending: 'X link coming soon',
    checkForUpdates: 'Check for Updates',
    checkingForUpdates: 'Checking…',
    updateAvailable: 'Version %s is available.',
    downloadAndInstall: 'Download and Install',
    downloadingUpdate: 'Downloading…',
    installingUpdate: 'Installing…',
    restartingAfterUpdate: 'Restarting…',
    upToDate: 'OneTouch is up to date.',
    updateFailed: 'Could not check for updates. Please try again.',
    updateDownloadFailed: 'Could not download the update. Please try again.',
    updateInstallFailed: 'Could not install the update. Please reopen OneTouch and try again.',
    retryUpdate: 'Try Again',
    updateReadyNote: 'OneTouch will restart automatically after installation.',
    betaUpdateTitle: 'Beta build',
    betaUpdateStatus: 'Beta builds do not install formal release updates.',
    newFeature: 'New feature',
  },
  zh: {
    title: '偏好设置',
    general: '通用',
    customise: '自定义',
    shortcuts: '快捷键',
    about: '关于',
    close: '关闭偏好设置',
    language: '语言',
    startAtLogin: '登录时启动',
    startAtLoginNote: '让 OneTouch 始终在菜单栏待命。',
    autostartError: '无法更新登录启动设置。',
    saved: '更改已保存在本机。',
    activeMenu: '菜单中显示',
    customiseIntro: '选择要显示的控制项，并拖动调整顺序。',
    visibleCount: '已选择 %ld',
    searchControls: '搜索控制项',
    detailTitle: '控制项详情',
    detailEmpty: '选择一个控制项，查看它在状态栏菜单中的显示方式。',
    reorder: '拖动调整顺序',
    enabledNote: '此控制项会显示在状态栏菜单中。',
    disabledNote: '启用后，此控制项才会显示在状态栏菜单中。',
    controlToggle: '持续开关',
    controlAction: '一次性操作',
    controlChoice: '应用内选择',
    controlSettings: '打开系统设置',
    shortcutIntro: '可以为任意控制项设置全局快捷键；未主动录制时不会注册任何按键。',
    shortcutRecord: '录制',
    shortcutRecording: '请按快捷键…',
    shortcutClear: '清除快捷键',
    shortcutHint: '请组合使用 ⌘、⌃ 或 ⌥；按 Delete 清除，按 Esc 取消。',
    shortcutNeedsModifier: '请加入 Command、Control 或 Option，避免占用正常输入。',
    shortcutNeedsKey: '请同时按下一个非修饰键。',
    shortcutDuplicate: '这个快捷键已分配给其他控制项。',
    shortcutUnavailable: '这个快捷键已被 macOS 或其他应用占用。',
    shortcutSaved: '快捷键已保存。',
    aboutTitle: 'OneTouch',
    version: '版本 %@',
    github: 'GitHub',
    githubPending: 'GitHub 链接稍后添加',
    x: 'X @hizhm1',
    xPending: 'X 链接稍后添加',
    checkForUpdates: '检查更新',
    checkingForUpdates: '正在检查…',
    updateAvailable: '发现新版本 %s。',
    downloadAndInstall: '下载并安装',
    downloadingUpdate: '正在下载…',
    installingUpdate: '正在安装…',
    restartingAfterUpdate: '正在重新启动…',
    upToDate: 'OneTouch 已是最新版本。',
    updateFailed: '无法检查更新，请稍后重试。',
    updateDownloadFailed: '无法下载更新，请稍后重试。',
    updateInstallFailed: '无法安装更新，请重新打开 OneTouch 后重试。',
    retryUpdate: '重试',
    updateReadyNote: '安装完成后 OneTouch 会自动重新启动。',
    betaUpdateTitle: 'Beta 测试版',
    betaUpdateStatus: '测试版不会安装正式版更新。',
    newFeature: '新功能',
  },
};

const TAB_DATA = [
  { id: 'general', icon: Settings2 },
  { id: 'customise', icon: SlidersHorizontal },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'about', icon: Info },
];

function StyledSelect({ ariaLabel, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeIfOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    window.addEventListener('pointerdown', closeIfOutside);
    return () => window.removeEventListener('pointerdown', closeIfOutside);
  }, [isOpen]);

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'Escape') setIsOpen(false);
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className={`styled-select ${isOpen ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected.label}</span><ChevronDown size={17} strokeWidth={1.75} />
      </button>
      {isOpen && <div className="select-menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} className={value === option.value ? 'is-selected' : ''} onClick={() => { onChange(option.value); setIsOpen(false); }}>{option.label}</button>)}
      </div>}
    </div>
  );
}

function PreferenceToggle({ checked, loading, label, onChange }) {
  return (
    <button
      type="button"
      className={`toggle preference-toggle ${checked ? 'is-on' : ''} ${loading ? 'is-loading' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-busy={loading}
      aria-label={label}
      disabled={loading}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function ShortcutRow({
  item,
  title,
  shortcut,
  recording,
  copy,
  onBeginRecording,
  onCancelRecording,
  onAssign,
}) {
  const Icon = item.icon;

  const handleKeyDown = async (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      onCancelRecording();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      await onAssign(item.id, '');
      onCancelRecording();
      return;
    }
    const candidate = shortcutFromKeyboardEvent(event);
    const saved = await onAssign(item.id, candidate.shortcut, candidate.reason);
    if (saved) onCancelRecording();
  };

  return (
    <div className={`hotkey-row ${recording ? 'is-recording' : ''}`}>
      <span><Icon size={19} strokeWidth={1.7} /><strong>{title}</strong></span>
      <span className="hotkey-actions">
        <button
          type="button"
          className={`record-button ${recording ? 'is-recording' : ''}`}
          aria-label={`${title}: ${recording ? copy.shortcutRecording : shortcut ? formatShortcut(shortcut) : copy.shortcutRecord}`}
          onClick={() => onBeginRecording(item.id)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (recording) onCancelRecording();
          }}
        >
          {recording ? copy.shortcutRecording : shortcut ? formatShortcut(shortcut) : copy.shortcutRecord}
        </button>
        {shortcut && (
          <button
            type="button"
            className="shortcut-clear"
            aria-label={`${copy.shortcutClear}: ${title}`}
            onClick={() => onAssign(item.id, '')}
          >
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  );
}

function SortableControlRow({
  item,
  title,
  visible,
  isNew,
  copy,
  reducedMotion,
  onVisibilityClick,
  onKeyboardMove,
}) {
  const Icon = item.icon;
  const {
    isDragging,
    isSorting,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
    transition: reducedMotion ? null : SORT_TRANSITION,
  });
  const setRowRef = (node) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  return (
    <div
      ref={setRowRef}
      role="listitem"
      data-control-id={item.id}
      aria-grabbed={isDragging}
      className={`custom-row kind-${item.kind} ${isDragging ? 'is-dragging' : ''} ${isSorting ? 'is-sorting' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...listeners}
    >
      <button
        type="button"
        className={`square-check ${visible ? 'is-checked' : ''}`}
        role="checkbox"
        aria-checked={visible}
        aria-label={`${title}: ${visible ? copy.enabledNote : copy.disabledNote}`}
        onClick={(event) => onVisibilityClick(event, item.id)}
      >
        {visible && <Check size={13} />}
      </button>
      <Icon size={21} strokeWidth={1.7} />
      <span className="custom-row-copy">
        <strong>{title}{isNew && <span className="new-feature-dot is-inline" aria-label={copy.newFeature} />}</strong>
        <small>{copy[`control${item.kind[0].toUpperCase()}${item.kind.slice(1)}`]}</small>
      </span>
      <button
        type="button"
        className="drag-handle"
        aria-label={`${copy.reorder}: ${title}`}
        onKeyDown={(event) => onKeyboardMove(event, item.id)}
      >
        <GripVertical size={18} />
      </button>
    </div>
  );
}

function DraggedControlPreview({ item, title, visible }) {
  const Icon = item.icon;
  return (
    <div className="custom-drag-preview" aria-hidden="true">
      <span className={`drag-preview-check ${visible ? 'is-checked' : ''}`}>{visible && <Check size={13} />}</span>
      <Icon size={21} strokeWidth={1.7} />
      <strong>{title}</strong>
      <span className="drag-preview-handle"><GripVertical size={18} /></span>
    </div>
  );
}

export default function Preferences({
  language,
  setLanguage,
  items,
  text,
  visibleIds,
  setVisibleIds,
  orderedIds,
  setOrderedIds,
  startAtLogin,
  startAtLoginLoading,
  startAtLoginError,
  onStartAtLoginChange,
  shortcuts,
  setShortcuts,
  nativeTitlebar = false,
  initialTab = 'general',
  appName = 'OneTouch',
  appVersion = '',
  newFeatureIds = [],
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (TAB_DATA.some(({ id }) => id === initialTab)) setActiveTab(initialTab);
  }, [initialTab]);
  const [draggedId, setDraggedId] = useState(null);
  const [recordingShortcutId, setRecordingShortcutId] = useState(null);
  const [shortcutMessage, setShortcutMessage] = useState('');
  const [shortcutMessageError, setShortcutMessageError] = useState(false);
  const suppressedClickRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6,
    },
  }));
  const copy = useMemo(() => ({
    ...PREFERENCES_COPY[language],
    aboutTitle: appName,
  }), [appName, language]);
  const activeItems = useMemo(() => orderedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean), [items, orderedIds]);
  const draggedItem = draggedId ? items.find((item) => item.id === draggedId) : null;
  const draggedTitle = draggedItem ? text[draggedItem.id]?.[0] : '';
  const draggedVisible = draggedItem ? visibleIds.includes(draggedItem.id) : false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggleVisible = (id) => {
    setVisibleIds((current) => toggleVisibleControl(current, id));
  };

  const clearSuppressedClick = (id) => {
    window.setTimeout(() => {
      if (suppressedClickRef.current === id) suppressedClickRef.current = null;
    }, 0);
  };

  const handleDragStart = ({ active }) => {
    const id = String(active.id);
    suppressedClickRef.current = id;
    setDraggedId(id);
  };

  const handleDragEnd = ({ active, over }) => {
    const id = String(active.id);
    if (over && active.id !== over.id) {
      setOrderedIds((current) => {
        const oldIndex = current.indexOf(id);
        const newIndex = current.indexOf(String(over.id));
        return oldIndex === -1 || newIndex === -1 ? current : arrayMove(current, oldIndex, newIndex);
      });
    }
    setDraggedId(null);
    clearSuppressedClick(id);
  };

  const handleDragCancel = ({ active }) => {
    const id = String(active.id);
    setDraggedId(null);
    clearSuppressedClick(id);
  };

  const handleVisibilityClick = (event, id) => {
    event.stopPropagation();
    if (suppressedClickRef.current === id) {
      suppressedClickRef.current = null;
      event.preventDefault();
      return;
    }
    toggleVisible(id);
  };

  const moveWithKeyboard = (event, id) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    setOrderedIds((current) => reorderControlByOffset(current, id, event.key === 'ArrowUp' ? -1 : 1));
  };

  const moveBetweenTabs = (event, id) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TAB_DATA.findIndex((tab) => tab.id === id);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TAB_DATA.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TAB_DATA.length) % TAB_DATA.length;
    const nextId = TAB_DATA[nextIndex].id;
    setActiveTab(nextId);
    window.requestAnimationFrame(() => {
      document.querySelector(`[role="tab"][data-tab="${nextId}"]`)?.focus();
    });
  };

  const assignShortcut = async (id, shortcut, reason = null) => {
    if (!shortcut && reason) {
      setShortcutMessage(reason === 'modifier' ? copy.shortcutNeedsModifier : copy.shortcutNeedsKey);
      setShortcutMessageError(true);
      return false;
    }

    if (!shortcut) {
      setShortcuts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setShortcutMessage('');
      setShortcutMessageError(false);
      return true;
    }

    if (shortcuts[id] === shortcut) {
      setShortcutMessage(copy.shortcutSaved);
      setShortcutMessageError(false);
      return true;
    }

    if (conflictingShortcutId(shortcuts, id, shortcut)) {
      setShortcutMessage(copy.shortcutDuplicate);
      setShortcutMessageError(true);
      return false;
    }

    try {
      await validateNativeGlobalShortcut(shortcut);
      setShortcuts((current) => ({ ...current, [id]: shortcut }));
      setShortcutMessage(copy.shortcutSaved);
      setShortcutMessageError(false);
      return true;
    } catch {
      setShortcutMessage(copy.shortcutUnavailable);
      setShortcutMessageError(true);
      return false;
    }
  };

  return (
    <section className={`preferences-window ${nativeTitlebar ? 'uses-native-titlebar' : ''}`} aria-label={copy.title}>
      {nativeTitlebar && <div className="native-titlebar-drag-region" data-tauri-drag-region aria-hidden="true" />}
      {!nativeTitlebar && (
        <header className="preferences-titlebar" data-tauri-drag-region>
          <div className="pref-lights" aria-hidden="true" data-tauri-drag-region><i /><i /><i /></div>
          <h1 data-tauri-drag-region>{copy.title}</h1>
          <button className="pref-close" type="button" onClick={onClose} aria-label={copy.close}><X size={17} /></button>
        </header>
      )}

      <nav className="preferences-tabs" aria-label={copy.title} role="tablist">
        {TAB_DATA.map(({ id, icon: Icon }) => (
          <button key={id} id={`pref-tab-${id}`} data-tab={id} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`pref-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? 'is-active' : ''} onClick={() => setActiveTab(id)} onKeyDown={(event) => moveBetweenTabs(event, id)}>
            <Icon size={22} strokeWidth={1.7} /><span>{copy[id]}</span>
          </button>
        ))}
      </nav>

      <div className="preferences-content">
        {activeTab === 'general' && (
          <section className="pref-panel general-panel" id="pref-panel-general" role="tabpanel" aria-labelledby="pref-tab-general">
            <div className="general-form">
              <div className="general-row"><span>{copy.language}</span><StyledSelect ariaLabel={copy.language} value={language} onChange={setLanguage} options={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]} /></div>
              <div className="general-row">
                <span>{copy.startAtLogin}</span>
                <div className="general-control-stack">
                  <PreferenceToggle
                    checked={startAtLogin}
                    loading={startAtLoginLoading}
                    label={copy.startAtLogin}
                    onChange={onStartAtLoginChange}
                  />
                  <small className={startAtLoginError ? 'is-error' : ''}>
                    {startAtLoginError || copy.startAtLoginNote}
                  </small>
                </div>
              </div>
              <p className="pref-saved"><Check size={13} /> {copy.saved}</p>
            </div>
          </section>
        )}

        {activeTab === 'customise' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <section className="pref-panel custom-panel" id="pref-panel-customise" role="tabpanel" aria-labelledby="pref-tab-customise">
              <div className="custom-layout">
                <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                  <div className={`custom-list ${draggedId ? 'is-reordering' : ''}`} role="list" aria-label={copy.activeMenu}>
                    {activeItems.map((item) => {
                      const [title] = text[item.id];
                      const visible = visibleIds.includes(item.id);
                      return (
                        <SortableControlRow
                          key={item.id}
                          item={item}
                          title={title}
                          visible={visible}
                          isNew={newFeatureIds.includes(item.id)}
                          copy={copy}
                          reducedMotion={reducedMotion}
                          onVisibilityClick={handleVisibilityClick}
                          onKeyboardMove={moveWithKeyboard}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </div>
            </section>
            {createPortal(
              <DragOverlay
                className="custom-drag-overlay"
                adjustScale={false}
                dropAnimation={reducedMotion ? null : DROP_ANIMATION}
                zIndex={9999}
              >
                {draggedItem ? (
                  <DraggedControlPreview
                    item={draggedItem}
                    title={draggedTitle}
                    visible={draggedVisible}
                  />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        )}

        {activeTab === 'shortcuts' && (
          <section className="pref-panel hotkey-panel" id="pref-panel-shortcuts" role="tabpanel" aria-labelledby="pref-tab-shortcuts">
            <p className="pref-lead">{copy.shortcutIntro}</p>
            <div className="hotkey-list">
              {activeItems.map((item) => (
                <ShortcutRow
                  key={item.id}
                  item={item}
                  title={text[item.id]?.[0] || item.id}
                  shortcut={shortcuts[item.id] || ''}
                  recording={recordingShortcutId === item.id}
                  copy={copy}
                  onBeginRecording={(id) => {
                    setRecordingShortcutId(id);
                    setShortcutMessage('');
                    setShortcutMessageError(false);
                  }}
                  onCancelRecording={() => setRecordingShortcutId(null)}
                  onAssign={assignShortcut}
                />
              ))}
            </div>
            <p className={`shortcut-hint ${shortcutMessageError ? 'is-error' : ''}`} aria-live="polite">
              <Keyboard size={14} />
              {shortcutMessage || copy.shortcutHint}
            </p>
          </section>
        )}

        {activeTab === 'about' && (
          <section className="pref-panel about-panel" id="pref-panel-about" role="tabpanel" aria-labelledby="pref-tab-about">
            <div className="about-mark"><ToggleRight size={48} /></div>
            <div><h2>{copy.aboutTitle}</h2></div>
            <div className="about-rule" />
            <div className="about-info"><strong>{appVersion || '—'}</strong></div>
          </section>
        )}
      </div>
    </section>
  );
}
