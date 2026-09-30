import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { request } from "../api/client";
import { groupDirectoryPageSchema } from "../api/schemas";
import { useLive } from "../state/live";
import {
  createGroupDirectoryController,
  groupDirectoryPath,
  type GroupDirectoryController,
} from "./controller";

const DirectoryContext = createContext<GroupDirectoryController | null>(null);
export function GroupDirectoryProvider({ children }: { children: ReactNode }) {
  const { directoryRevision, getLastSeq } = useLive();
  const readSequence = useRef(getLastSeq);
  readSequence.current = getLastSeq;
  const [controller] = useState(() =>
    createGroupDirectoryController(
      (query, signal) =>
        request(groupDirectoryPath(query), groupDirectoryPageSchema, {
          signal,
        }),
      undefined,
      () => readSequence.current(),
    ),
  );
  const prior = useRef(directoryRevision);
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  useEffect(() => {
    if (prior.current !== directoryRevision) {
      prior.current = directoryRevision;
      controller.invalidate();
    }
  }, [controller, directoryRevision]);
  return (
    <DirectoryContext.Provider value={controller}>
      {children}
    </DirectoryContext.Provider>
  );
}
export function useGroupDirectory() {
  const controller = useContext(DirectoryContext);
  if (!controller) throw new Error("GroupDirectoryProvider is required");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}
