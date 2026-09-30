import { useEffect, useRef, useState } from "react";

// Kept local to the two group forms: closing does not cancel an accepted request.
export function useGroupFormGuard(dirty: boolean, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const pending = useRef(false);
  const closed = useRef(false);
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const close = (): void => {
    if (!mounted.current || pending.current || closed.current) return;
    if (dirty) setConfirmDiscard(true);
    else {
      closed.current = true;
      onClose();
    }
  };
  const discard = (): void => {
    if (!mounted.current || pending.current || closed.current) return;
    closed.current = true;
    onClose();
  };
  const submit = async (
    action: (isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> => {
    // A ref guards same-tick re-entry before React paints disabled controls.
    if (!mounted.current || pending.current || closed.current || confirmDiscard)
      return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const current = generation.current;
    const isCurrent = (): boolean =>
      mounted.current && generation.current === current && !closed.current;
    try {
      await action(isCurrent);
      if (isCurrent()) closed.current = true;
    } catch (value) {
      if (isCurrent()) setError(value);
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return {
    busy,
    error,
    close,
    discard,
    submit,
    confirmDiscard,
    continueEditing: (): void => setConfirmDiscard(false),
  };
}
