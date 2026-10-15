export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
};
/** Missing permission, unsupported API and timeout are successful advisory fallbacks. */
export function advisoryCoordinates(): Promise<Coordinates | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return resolve(undefined);
    const timer = setTimeout(() => resolve(undefined), 3000);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        { timeout: 3000, maximumAge: 0, enableHighAccuracy: false },
      );
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}
