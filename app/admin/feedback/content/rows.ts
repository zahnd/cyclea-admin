import type { ContentFeedback } from "@/lib/feedback/content";
import type { ContentKind } from "@/lib/feedback/validation";

import type { ContentRatingRow } from "./content-grid";

/** What the ratings grid needs of a rating -- the triage note stays on the server. */
export function toRatingRow(item: ContentFeedback): ContentRatingRow {
  return {
    id: item.id,
    contentKind: item.contentKind,
    directusId: item.directusId,
    rating: item.rating,
    note: item.note,
    title: item.title,
    updatedAt: item.updatedAt,
    status: item.status,
    noteChangedSinceTriage: item.noteChangedSinceTriage,
  };
}

/** An item's summary page: its kind and Directus id, never its title. */
export function itemHref(kind: ContentKind, directusId: number): string {
  return `/admin/feedback/content/item/${kind}/${directusId}`;
}
