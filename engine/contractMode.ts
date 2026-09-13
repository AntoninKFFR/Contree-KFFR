import { SUIT_LABELS, SUIT_SYMBOLS } from "./cards";
import type { Contract, ContractMode, Suit } from "./types";

export type ContractModeInput = ContractMode | Suit;

export function normalizeContractMode(input: ContractModeInput): ContractMode {
  return typeof input === "string" ? { kind: "suit", suit: input } : input;
}

export function resolveContractMode(value: {
  contractMode?: ContractMode | null;
  trump?: Suit | null;
}): ContractMode | null {
  return value.contractMode ?? (value.trump ? { kind: "suit", suit: value.trump } : null);
}

export function legacyTrump(mode: ContractModeInput): Suit | null {
  const normalized = normalizeContractMode(mode);
  return normalized.kind === "suit" ? normalized.suit : null;
}

export function isTrumpSuit(suit: Suit, mode: ContractModeInput): boolean {
  const normalized = normalizeContractMode(mode);
  return normalized.kind === "suit" && normalized.suit === suit;
}

export function usesTrumpRanking(suit: Suit, mode: ContractModeInput): boolean {
  const normalized = normalizeContractMode(mode);
  return normalized.kind === "all-trump"
    || (normalized.kind === "suit" && normalized.suit === suit);
}

export function formatContractMode(mode: ContractModeInput): string {
  const normalized = normalizeContractMode(mode);
  if (normalized.kind === "no-trump") return "Sans Atout";
  if (normalized.kind === "all-trump") return "Tout Atout";
  return `${SUIT_LABELS[normalized.suit]} ${SUIT_SYMBOLS[normalized.suit]}`;
}

export function formatContractLabel(contract: Contract): string {
  const name = contract.kind === "generale" ? "Générale" : contract.kind === "capot" ? "Capot" : String(contract.value);
  return `${name} ${formatContractMode(resolveContractMode(contract)!)}`;
}
