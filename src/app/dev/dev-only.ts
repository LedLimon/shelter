import { notFound } from "next/navigation";

/**
 * 404 outside `next dev`. Call it in every /dev page, not only in the layout:
 * Next renders layouts and pages in parallel, so a layout check alone still
 * sends the page's content in the RSC payload.
 */
export function assertDevelopment(): void {
  if (process.env.NODE_ENV !== "development") notFound();
}
