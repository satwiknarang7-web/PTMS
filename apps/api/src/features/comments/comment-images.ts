export { detectImageType } from '../../common/utils/image.util';

/** Largest image accepted per upload (the browser shrinks photos well below this first). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES_PER_COMMENT = 6;
/** Uploads not posted with a comment within this time are deleted. */
export const PENDING_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;

