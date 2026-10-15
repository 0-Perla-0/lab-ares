/** Keep lease renewal serialized while an external operation is in flight.
 * Loss never gets swallowed: callers must not publish the prepared artifact. */
export async function withRenewingLease<T>(
  leaseMs: number,
  renew: () => Promise<unknown>,
  prepare: () => Promise<T>,
): Promise<T> {
  let renewal = Promise.resolve();
  let failure: unknown;
  await renew();
  const timer = setInterval(
    () => {
      renewal = renewal
        .then(async () => {
          if (!failure) await renew();
        })
        .catch((error) => {
          failure = error;
        });
    },
    Math.max(1000, Math.floor(leaseMs / 3)),
  );
  timer.unref();
  try {
    const result = await prepare();
    await renewal;
    if (failure) throw failure;
    await renew();
    return result;
  } finally {
    clearInterval(timer);
    await renewal;
  }
}
