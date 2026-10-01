import { Alert, AlertDescription } from "@/components/reui/alert";

import type { FormState } from "./actions";

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{state.ok}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
