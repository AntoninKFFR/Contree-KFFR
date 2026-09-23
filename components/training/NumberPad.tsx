"use client";

import type { KeyboardEvent } from "react";
import { appPrimaryActionClass } from "@/components/ui/AppShell";

type NumberPadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function NumberPad({ value, onChange, onSubmit, disabled = false }: NumberPadProps) {
  const append = (digit: string) => {
    if (!disabled && value.length < 3) onChange(value + digit);
  };
  const erase = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (/^[0-9]$/.test(event.key)) { event.preventDefault(); append(event.key); }
    else if (event.key === "Backspace") { event.preventDefault(); erase(); }
    else if (event.key === "Delete") { event.preventDefault(); onChange(""); }
    else if (event.key === "Enter" && value) { event.preventDefault(); onSubmit(); }
  };

  return <div className="mx-auto w-full max-w-xs">
    <label className="block text-sm font-bold" htmlFor="training-answer">Ta réponse en points</label>
    <input
      aria-label="Ta réponse en points"
      className="coinche-input mt-2 h-14 w-full rounded-xl border text-center text-2xl font-black outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
      disabled={disabled}
      id="training-answer"
      inputMode="none"
      onKeyDown={onKeyDown}
      placeholder="?"
      readOnly
      type="text"
      value={value}
    />
    <div aria-label="Pavé numérique" className="mt-3 grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) =>
        <button className="coinche-secondary-action min-h-12 rounded-xl border text-lg font-bold touch-manipulation disabled:opacity-50" disabled={disabled || value.length >= 3} key={digit} onClick={() => append(digit)} type="button">{digit}</button>,
      )}
      <button aria-label="Tout effacer" className="coinche-secondary-action min-h-12 rounded-xl border text-sm font-bold touch-manipulation disabled:opacity-50" disabled={disabled || !value} onClick={() => onChange("")} type="button">Effacer</button>
      <button className="coinche-secondary-action min-h-12 rounded-xl border text-lg font-bold touch-manipulation disabled:opacity-50" disabled={disabled || value.length >= 3} onClick={() => append("0")} type="button">0</button>
      <button aria-label="Corriger" className="coinche-secondary-action min-h-12 rounded-xl border text-lg font-bold touch-manipulation disabled:opacity-50" disabled={disabled || !value} onClick={erase} type="button">⌫</button>
    </div>
    <button className={`${appPrimaryActionClass} mt-3 min-h-12 w-full text-base`} disabled={disabled || !value} onClick={onSubmit} type="button">Valider</button>
  </div>;
}
