"use client";
import { useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appInputClass, appPrimaryActionClass } from "@/components/ui/AppShell";
import { BID_READING_LEVEL_NAMES, type BidReadingLevel } from "@/engine/training/bidReading";

export function TrainWithFriendDialog({ username, pending, onCreate, onClose }: {
  username: string; pending: boolean; onCreate: (level: BidReadingLevel) => void; onClose: () => void;
}) {
  const [level, setLevel] = useState<BidReadingLevel>(1);
  return <AccessibleDialog title={`S’entraîner avec ${username}`} backdropClassName="friends-training-dialog" width="medium" onClose={() => { if (!pending) onClose(); }}
    footer={<button className={appPrimaryActionClass} type="button" disabled={pending} onClick={() => onCreate(level)}>{pending ? "Création…" : "Créer le duo"}</button>}>
    <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
      <label className="block text-sm font-bold" htmlFor="friend-duo-level">Niveau</label>
      <select id="friend-duo-level" className={`${appInputClass} mt-2`} disabled={pending} value={level} onChange={(event) => setLevel(Number(event.target.value) as BidReadingLevel)}>
        {([1, 2, 3, 4] as const).map((value) => <option key={value} value={value}>Niveau {value} · {BID_READING_LEVEL_NAMES[value]}</option>)}
      </select>
    </div>
  </AccessibleDialog>;
}
