/**
 * useIssueNav — Multi-issue navigation for Universal Smart Navigation.
 *
 * NAVIGATION ONLY. When an admin opens one of several recommendations, they can
 * step Previous / Next between issues without going back to the source screen.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { readIssueQueue, setIssueQueueIndex } from "@/lib/smart-navigation";

export function useIssueNav() {
  const navigate = useNavigate();
  const [queue] = useState(readIssueQueue);
  const total = queue?.entries.length ?? 0;
  const index = queue?.index ?? 0;

  const go = useCallback(
    (next: number) => {
      if (!queue || next < 0 || next >= queue.entries.length) return;
      const entry = queue.entries[next];
      setIssueQueueIndex(next);
      navigate({
        to: entry.to as "/admin-product/$slug/details",
        params: entry.params as never,
        search: entry.search as never,
      });
    },
    [navigate, queue],
  );

  return useMemo(
    () => ({
      total,
      index,
      hasQueue: total > 1,
      label: total > 1 ? `${index + 1} of ${total} recommendations` : null,
      prev: index > 0 ? () => go(index - 1) : null,
      next: index < total - 1 ? () => go(index + 1) : null,
    }),
    [go, index, total],
  );
}
