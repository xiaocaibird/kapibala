interface SnapshotVersion {
  generation: number;
  revision: number;
}

/** A complete fresh snapshot supersedes both data and errors from an older page. */
export async function loadEarlierTimelinePage<T>(options: {
  readVersion: () => SnapshotVersion;
  load: () => Promise<T>;
  onPage: (page: T) => void;
  onError: (error: unknown) => void;
}): Promise<void> {
  const started = options.readVersion();
  const isCurrent = () => {
    const current = options.readVersion();
    return (
      current.generation === started.generation &&
      current.revision === started.revision
    );
  };
  try {
    const page = await options.load();
    if (isCurrent()) options.onPage(page);
  } catch (error) {
    if (isCurrent()) options.onError(error);
  }
}
