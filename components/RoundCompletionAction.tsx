import React from "react";

type RoundCompletionActionProps = {
  disabled?: boolean;
  label: "Manche suivante" | "Nouvelle partie";
  onClick: () => void;
};

export function RoundCompletionAction({ disabled = false, label, onClick }: RoundCompletionActionProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <button
        className="pointer-events-auto min-h-11 w-full max-w-xs rounded-xl border border-amber-200/30 bg-[#f3ead2] px-5 py-3 text-sm font-black text-[#10251b] shadow-[0_12px_32px_rgb(0_0_0_/_45%)] transition hover:bg-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-w-56"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}
