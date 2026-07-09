import { useState } from "react";
import {
  type Form,
  textInputProps,
  useField,
  useForm,
  useFormSelectorShallow,
  useIsDirty,
  useIsValid,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import { FieldError } from "./FieldError";
import {
  shadcnSelectProps,
  shadcnSliderProps,
  shadcnSwitchProps,
} from "./shadcnAdapter";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const schema = z.object({
  displayName: z.string().min(1, "display name required"),
  theme: z.enum(["system", "light", "dark"]),
  volume: z.number().min(0).max(100),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    digest: z.boolean(),
  }),
});

type Schema = typeof schema;

// The badges row gets its own shallow selector: dirtyFields() builds a fresh
// array per call, so it must be the selector's direct result (compared
// element-wise by useShallow), never a property of a composite selector
// object.
const DirtyBadges = ({ form }: Readonly<{ form: Form<Schema> }>) => {
  const dirtyPaths = useFormSelectorShallow(form, () => form.dirtyFields());

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">
        Unsaved changes ({dirtyPaths.length}):
      </span>
      {dirtyPaths.length === 0 ? (
        <span className="text-sm text-muted-foreground">none</span>
      ) : (
        dirtyPaths.map((path) => <Badge key={path}>{path}</Badge>)
      )}
    </div>
  );
};

export const ShadcnSettingsForm = () => {
  const form = useForm(schema, {
    initialValues: {
      displayName: "Tim",
      theme: "system",
      volume: 40,
      notifications: { email: true, push: false, digest: true },
    },
    mode: "onChange",
  });
  useDemoForm(form);
  const displayName = useField(form, "displayName");
  const theme = useField(form, "theme");
  const volume = useField(form, "volume");
  const emailNotif = useField(form, "notifications.email");
  const pushNotif = useField(form, "notifications.push");
  const digestNotif = useField(form, "notifications.digest");
  const isDirty = useIsDirty(form);
  const isValid = useIsValid(form);
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid max-w-md gap-4">
      <p className="text-sm text-muted-foreground">
        Save is gated on <code>useIsDirty && useIsValid</code>; the badges are{" "}
        <code>form.dirtyFields()</code> live. Saving calls{" "}
        <code>adoptValues</code> (rebase, not reset) — Discard calls{" "}
        <code>reset()</code> back to the last saved state.
      </p>

      <DirtyBadges form={form} />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="settings-name">Display name</Label>
            <Input id="settings-name" {...textInputProps(displayName)} />
            <FieldError field={displayName} />
          </div>
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select {...shadcnSelectProps(theme)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            {/* No htmlFor: Radix Slider's root is a <span> (not labelable),
                so the accessible name goes to the thumb via aria-label. */}
            <Label>
              Notification volume
              <span className="text-muted-foreground">{volume.value}%</span>
            </Label>
            <Slider
              aria-label="Notification volume"
              min={0}
              max={100}
              step={1}
              {...shadcnSliderProps(volume)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Radix switches — <code>onCheckedChange</code> via the adapter.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-email">Email notifications</Label>
            <Switch id="settings-email" {...shadcnSwitchProps(emailNotif)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-push">Push notifications</Label>
            <Switch id="settings-push" {...shadcnSwitchProps(pushNotif)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-digest">Weekly digest</Label>
            <Switch id="settings-digest" {...shadcnSwitchProps(digestNotif)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          disabled={!isDirty || !isValid}
          onClick={() =>
            void form.handleSubmit(() => {
              form.adoptValues(form.getState().values);
              setSaved(true);
            })()
          }
        >
          Save settings
        </Button>
        <Button
          variant="outline"
          disabled={!isDirty}
          onClick={() => form.reset()}
        >
          Discard changes
        </Button>
        {saved && !isDirty ? (
          <span className="text-sm text-muted-foreground">
            saved — the badges are gone until the next edit.
          </span>
        ) : null}
      </div>
    </div>
  );
};
