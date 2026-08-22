import { useCallback, useState } from "react";

import { useSyncStatus } from "@/components/provider/SyncProvider";

export function useSyncRefresh() {
  const { syncNow } = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await syncNow();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, syncNow]);

  return { refreshing, onRefresh };
}
