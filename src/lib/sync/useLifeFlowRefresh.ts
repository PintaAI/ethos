import { useCallback, useState } from "react";
import { useSyncStatus } from "@/components/provider/SyncProvider";
import { useLifeFlow } from "@/data/lifeflow/LifeFlowProvider";

export function useLifeFlowRefresh() {
  const sync = useSyncStatus();
  const flow = useLifeFlow();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await sync.syncNow();
      await flow.refresh();
    } catch (error) {
      console.warn("[lifeflow] pull-to-refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, sync, flow]);

  return { refreshing, onRefresh };
}
