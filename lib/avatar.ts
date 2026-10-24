// El avatar de cada pana es un emoji o, si subió foto, la ruta de su foto (/api/foto/<id>?v=<versión>).
export const PHOTO_PREFIX = "/api/foto/";

export const isPhoto = (avatar?: string | null): boolean => !!avatar && avatar.startsWith(PHOTO_PREFIX);

export const photoPath = (userId: string, version: number) => `${PHOTO_PREFIX}${userId}?v=${version}`;

/** Para mostrar el avatar como texto (donde no cabe una imagen). */
export const avatarText = (avatar?: string | null, fallback = "🙂") => (isPhoto(avatar) ? fallback : (avatar ?? fallback));
