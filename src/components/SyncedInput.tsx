import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Value held in the URL (already normalised). */
  value: string;
  onCommit: (raw: string) => void;
  /** How the URL will store what the user typed (e.g. trimmed). */
  normalize?: (raw: string) => string;
}

/**
 * An input whose value lives in the URL. It keeps its own text while the user
 * types, so router updates never drop keystrokes or strip a trailing space, and
 * it only resyncs when the URL changes from somewhere else (e.g. "Clear filters").
 */
export function SyncedInput({ value, onCommit, normalize = (s) => s, ...rest }: Props) {
  const [text, setText] = useState(value);
  const lastPushed = useRef(value);

  useEffect(() => {
    if (value !== lastPushed.current) {
      lastPushed.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        lastPushed.current = normalize(e.target.value);
        onCommit(e.target.value);
      }}
    />
  );
}
