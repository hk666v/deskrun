import { Show, createSignal } from "solid-js";
import { describeShortcut, isUsableShortcut } from "../lib/shortcuts";

interface ShortcutInputProps {
  value: string;
  label: string;
  onCommit: (value: string) => void;
}

/// Keys pressed on the way to a combination rather than as one: the modifiers
/// themselves, and the lock keys nobody means to bind.
const INCOMPLETE_KEYS = new Set([
  "Control",
  "Alt",
  "Shift",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
]);

/// A shortcut field that is filled by pressing the combination rather than by
/// typing it. Clicking it starts listening; the next combination pressed is the
/// one that gets bound.
///
/// Typing was the old way in, and it fought the user: `onChange` fired on every
/// keystroke, so "Ctrl+S" registered "C", then "Ct", then "Ctrl" — three
/// failures to read on the way to one shortcut.
export function ShortcutInput(props: ShortcutInputProps) {
  const [listening, setListening] = createSignal(false);
  const [refused, setRefused] = createSignal(false);

  const stop = () => {
    setListening(false);
    setRefused(false);
  };

  return (
    <>
      <input
        readonly
        // Set only while listening. The app's key handler stands down for a key
        // pressed into this field, so Escape here cancels the capture instead of
        // closing the settings drawer behind it.
        data-shortcut-recording={listening() ? "" : undefined}
        value={listening() ? "" : props.value}
        placeholder={listening() ? "Press the combination" : ""}
        aria-label={props.label}
        // Clicking as well as focusing, because the field keeps the focus after
        // a combination is recorded and a second click fires no focus event.
        onFocus={() => setListening(true)}
        onClick={() => setListening(true)}
        onBlur={stop}
        onKeyDown={(event) => {
          if (!listening()) {
            return;
          }

          // Tab is the way out of the field, so it is left alone. Everything
          // else is the shortcut being recorded, and nothing may act on it.
          if (event.key === "Tab") {
            stop();
            return;
          }

          event.preventDefault();

          if (event.key === "Escape") {
            stop();
            return;
          }
          if (INCOMPLETE_KEYS.has(event.key)) {
            return;
          }

          const value = describeShortcut(event);
          if (!isUsableShortcut(value)) {
            // Stay listening: the user is most likely half way through holding
            // the modifiers down, and the next press is the one they meant.
            setRefused(true);
            return;
          }

          stop();
          props.onCommit(value);
        }}
        // The arrow rather than the caret: the field is not somewhere to type.
        class="field-input cursor-default"
      />
      <Show when={refused()}>
        <span class="text-meta text-danger">Needs Ctrl or Alt</span>
      </Show>
    </>
  );
}
