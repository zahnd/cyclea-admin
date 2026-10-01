import { Alert, AlertDescription } from "@/components/reui/alert";

import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { denied } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Cyclea</h1>
        <p className="text-sm text-muted-foreground">Sign in with a code sent to your email.</p>
      </div>
      {denied && (
        <Alert variant="destructive">
          <AlertDescription>This account has no access here.</AlertDescription>
        </Alert>
      )}
      <LoginForm />
    </div>
  );
}
