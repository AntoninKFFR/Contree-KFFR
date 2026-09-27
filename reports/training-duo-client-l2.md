# Training duo L2 client

- `/training/duo` creates a level 1–4 session or joins by code; `/training/duo/[sessionId]` presents lobby, synchronized question, reveal, and terminal states.
- `lib/trainingDuoApi.ts` uses authenticated, uncached requests and handles a guest lobby leave as an empty 204. `set-ready`, `submit-answer`, and `ready-next` refetch after a CAS conflict and retry at most once if the intent is still applicable. `start`, `leave`, and `cancel` are never replayed automatically.
- `lib/trainingDuoRealtime.ts` listens only to `training_duo_sessions` and `training_duo_participants`, debounces invalidations for 50 ms, then refetches the projected API view. `useTrainingDuoSync` rejects older `stateVersion` responses, guards auth and session changes, and heartbeats immediately, every 15 seconds, and on focus, visible, and online events while lobby or active.
- The duo reuses the solo public auction, assertion form, and doctrine presentation without generating or grading a series in the browser. No duo record, progression, Elo, or invitation is written.
- L3 remains responsible for two authenticated browser contexts, network leakage checks, full offline/reconnect and responsive E2E, rate limiting, final observability, and retention cleanup.
