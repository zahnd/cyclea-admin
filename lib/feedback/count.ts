import "server-only";

import { countNewContentFeedback } from "./content";
import { countNewAppFeedback } from "./data";

/**
 * Untriaged feedback of every kind, for the badge on the Feedback section:
 * app feedback and manual entries without a decision, plus content ratings
 * with a note that need a look. Bare thumbs never count.
 */
export async function countNewFeedback(): Promise<number> {
  const [app, content] = await Promise.all([countNewAppFeedback(), countNewContentFeedback()]);
  return app + content;
}
