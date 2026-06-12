/** Serializes all Google Drive vault read/write operations (backup, pull, merge). */
let ioTail: Promise<unknown> = Promise.resolve();

export const runDriveIoSerialized = <T>(fn: () => Promise<T>): Promise<T> => {
  const resultPromise = ioTail.then(fn);
  ioTail = resultPromise.then(
    () => undefined,
    () => undefined,
  );
  return resultPromise;
};
