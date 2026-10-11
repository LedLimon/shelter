import { z } from "zod";
import { mediaItemsSchema } from "@/lib/media/items";

export const DEMO_PHOTOS_MAX = 12;
export const DEMO_RECEIPTS_MAX = 6;

/** The demo form: a dog's photos with a cover, an expense's receipts. */
export const mediaDemoSchema = z.object({
  photos: mediaItemsSchema({ max: DEMO_PHOTOS_MAX }),
  receipts: mediaItemsSchema({ max: DEMO_RECEIPTS_MAX }),
});

export type MediaDemoValues = z.input<typeof mediaDemoSchema>;
