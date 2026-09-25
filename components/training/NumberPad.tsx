"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { appPrimaryActionClass } from "@/components/ui/AppShell";

type NumberPadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
};

export function NumberPad({ value, onChange, onSubmit, disabled = false, label = "Ta réponse en points", compact = false }: NumberPadProps) {
  const sanitize = (input: string) => input.replace(/\D/g, "").slice(0, 3);
  const append = (digit: string) => {
    if (!disabled) onChange(sanitize(value + digit));
  };
  const erase = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === "Enter" && value) { event.preventDefault(); onSubmit(); }
  };
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) onChange(sanitize(event.target.value));
  };

  return <div className={`mx-auto w-full ${compact ? "max-w-sm" : "max-w-xs"}`}>
    <label className="block text-sm font-bold" htmlFor="training-answer">{label}</label>
    <input
      aria-label={label}
      className={`coinche-input w-full rounded-xl border text-center font-black outline-none focus:ring-2 focus:ring-[var(--focus-ring)] ${compact ? "mt-1 h-11 text-xl" : "mt-2 h-14 text-2xl"}`}
      disabled={disabled}
      id="training-answer"
      inputMode="numeric"
      onChange={onInputChange}
      onKeyDown={onKeyDown}
      placeholder="?"
      type="text"
      value={value}
    />
    <div aria-label="Pavé numérique" className={`${compact ? "mt-2 gap-1.5 sm:grid-cols-6" : "mt-3 gap-2"} grid grid-cols-3`}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) =>
        <button className={`coinche-secondary-action rounded-xl border font-bold touch-manipulation disabled:opacity-50 ${compact ? "min-h-11 text-base" : "min-h-12 text-lg"}`} disabled={disabled || value.length >= 3} key={digit} onClick={() => append(digit)} type="button">{digit}</button>,
      )}
      <button aria-label="Tout effacer" className={`coinche-secondary-action rounded-xl border text-sm font-bold touch-manipulation disabled:opacity-50 ${compact ? "min-h-11" : "min-h-12"}`} disabled={disabled || !value} onClick={() => onChange("")} type="button">Effacer</button>
      <button className={`coinche-secondary-action rounded-xl border text-lg font-bold touch-manipulation disabled:opacity-50 ${compact ? "min-h-11" : "min-h-12"}`} disabled={disabled || value.length >= 3} onClick={() => append("0")} type="button">0</button>
      <button aria-label="Corriger" className={`coinche-secondary-action rounded-xl border text-lg font-bold touch-manipulation disabled:opacity-50 ${compact ? "min-h-11" : "min-h-12"}`} disabled={disabled || !value} onClick={erase} type="button">⌫</button>
    </div>
    <button className={`${appPrimaryActionClass} w-full text-base ${compact ? "mt-2 min-h-11" : "mt-3 min-h-12"}`} disabled={disabled || !value} onClick={onSubmit} type="button">Valider</button>
  </div>;
}
