import { useState } from "react";
import { useField, useForm, useIsSubmitting } from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import { FieldError } from "./FieldError";
import { shadcnCheckboxProps, shadcnInputProps } from "./shadcnAdapter";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const TAKEN = new Set(["tim", "admin", "root"]);

const fakeAvailabilityCheck = (name: string): Promise<boolean> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(!TAKEN.has(name.toLowerCase())), 500),
  );

const schema = z
  .object({
    // The async refine makes the whole schema async; formstand validates
    // just this field's subschema on edits, so typing in the password box
    // never fires the availability check.
    username: z
      .string()
      .min(3, "3+ characters")
      .refine(fakeAvailabilityCheck, "that username is taken"),
    email: z.email("valid email required"),
    password: z.string().min(8, "8+ characters"),
    confirm: z.string(),
    terms: z.boolean().refine((v) => v, "you must accept the terms"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm) {
      ctx.addIssue({
        code: "custom",
        message: "passwords must match",
        path: ["confirm"],
      });
    }
  });

export const ShadcnSignupForm = () => {
  const form = useForm(schema, {
    initialValues: {
      username: "",
      email: "",
      password: "",
      confirm: "",
      terms: false,
    },
    mode: "onBlur",
  });
  useDemoForm(form);
  const username = useField(form, "username");
  const email = useField(form, "email");
  const password = useField(form, "password");
  const confirm = useField(form, "confirm");
  const terms = useField(form, "terms");
  const isSubmitting = useIsSubmitting(form);
  const [created, setCreated] = useState<string | null>(null);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          onBlur mode — try <code>tim</code> as the username: the async
          availability check runs against just that field's subschema.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="signup-username">Username</Label>
          <Input id="signup-username" {...shadcnInputProps(username)} />
          {username.isValidating ? (
            <p className="text-sm text-muted-foreground">
              checking availability…
            </p>
          ) : (
            <FieldError field={username} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            placeholder="you@example.com"
            {...shadcnInputProps(email)}
          />
          <FieldError field={email} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            {...shadcnInputProps(password)}
          />
          <FieldError field={password} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-confirm">Confirm password</Label>
          <Input
            id="signup-confirm"
            type="password"
            {...shadcnInputProps(confirm)}
          />
          <FieldError field={confirm} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Checkbox id="signup-terms" {...shadcnCheckboxProps(terms)} />
            <Label htmlFor="signup-terms">
              I accept the terms of service
            </Label>
          </div>
          <FieldError field={terms} />
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          onClick={() =>
            void form.handleSubmit((data) => {
              setCreated(data.username);
            })()
          }
        >
          {isSubmitting ? "Creating…" : "Create account"}
        </Button>
        {created !== null ? (
          <p className="text-sm text-muted-foreground">
            welcome, <span className="text-foreground">{created}</span> —
            submit resolved <code>kind: "valid"</code>.
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
};
