"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteAllowedEmailAction } from "./actions";

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await inviteAllowedEmailAction(formData);
      if (result.ok) {
        setSuccess(`Invited ${formData.get("email")}.`);
        (document.getElementById("invite-form") as HTMLFormElement | null)?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form id="invite-form" action={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="member@example.com"
            required
            autoComplete="off"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="intendedRole" className="text-xs font-medium text-muted-foreground">
            Role
          </label>
          <select
            id="intendedRole"
            name="intendedRole"
            defaultValue="MEMBER"
            disabled={pending}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </form>
  );
}
