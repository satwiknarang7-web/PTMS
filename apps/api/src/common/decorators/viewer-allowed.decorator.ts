import { SetMetadata } from '@nestjs/common';

export const VIEWER_ALLOWED_KEY = 'viewerAllowed';

/**
 * Opens a route (or a whole controller) to the client VIEWER role. Every other route refuses viewers,
 * so new endpoints stay closed to clients unless someone decides otherwise.
 */
export const ViewerAllowed = () => SetMetadata(VIEWER_ALLOWED_KEY, true);
