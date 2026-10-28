import type { SfxButton } from '@stream95/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotify } from '@/components/notify';
import { api } from '@/lib/api';
import { applyOrder, moveId, sameIds } from './lib';
import { toActionError } from './use-action';

/**
 * Button order with instant feedback: a move shows at once, the new order goes to the server one
 * request at a time (so the last move wins) and the server list takes over once it matches.
 */
export function useButtonOrder(buttons: readonly SfxButton[]) {
  const notify = useNotify();
  const [pending, setPending] = useState<string[] | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const ordered = useMemo(() => applyOrder(buttons, pending), [buttons, pending]);

  useEffect(() => {
    if (!pending) return;
    const shown = applyOrder(buttons, pending).map((b) => b.id);
    if (
      sameIds(
        shown,
        buttons.map((b) => b.id),
      )
    )
      setPending(null);
  }, [buttons, pending]);

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      const ids = moveId(
        ordered.map((b) => b.id),
        id,
        delta,
      );
      setPending(ids);
      chain.current = chain.current
        .then(() => api('PUT', '/api/sfx/buttons/order', { ids }))
        .catch((err: unknown) => {
          setPending(null);
          const { title, fix } = toActionError(err);
          notify({ tone: 'error', title, description: fix });
        });
    },
    [ordered, notify],
  );

  return { ordered, move };
}
