import { Alert, AlertDescription } from "@/components/reui/alert";

/** The outcome of a server action, shown under its form. */
export function FormMessage({ state }: { state: { error?: string; ok?: string } }) {
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
