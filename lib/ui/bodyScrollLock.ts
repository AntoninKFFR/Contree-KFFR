const locks = new WeakMap<HTMLElement, { count: number; previousOverflow: string }>();

/** Temporary scroll ownership shared by menus and dialogs, including overlapping lifetimes. */
export function lockBodyScroll(body: HTMLElement): () => void {
  const lock = locks.get(body) ?? { count: 0, previousOverflow: body.style.overflow };
  lock.count += 1;
  locks.set(body, lock);
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.count -= 1;
    if (lock.count === 0) {
      body.style.overflow = lock.previousOverflow;
      locks.delete(body);
    }
  };
}
