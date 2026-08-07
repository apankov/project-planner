import { useCallback, useEffect, useState } from "react";
import { UndoHistory } from "src/lib/undo-history";

/** Keeps an undo button in step with the shared history. */
export function useUndoHistory(history: UndoHistory) {
  const [, setVersion] = useState(0);

  useEffect(
    () => history.subscribe(() => setVersion((value) => value + 1)),
    [history]
  );

  const undo = useCallback(() => history.undoLast(), [history]);

  return {
    canUndo: history.canUndo(),
    label: history.peekLabel(),
    undo,
  };
}
