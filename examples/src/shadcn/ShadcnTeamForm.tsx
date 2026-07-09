import { memo, useState } from "react";
import { ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type Form, useField, useFieldArray, useForm } from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import { FieldError } from "./FieldError";
import { shadcnInputProps, shadcnSelectProps } from "./shadcnAdapter";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

const ROLES = [
  { value: "engineer", label: "Engineer" },
  { value: "designer", label: "Designer" },
  { value: "manager", label: "Manager" },
] as const;

const memberSchema = z.object({
  name: z.string().min(1, "name required"),
  email: z.email("valid email required"),
  role: z.enum(["engineer", "designer", "manager"]),
});

type Member = z.infer<typeof memberSchema>;

const schema = z.object({
  teamName: z.string().min(2, "2+ characters"),
  members: z
    .array(memberSchema)
    .min(1, "add at least one member")
    // Cross-row rule: the issue lands on the *second* copy's email path, so
    // the error renders under the row that introduced the duplicate.
    .superRefine((members, ctx) => {
      const firstIndexByEmail = new Map<string, number>();
      members.forEach((member, index) => {
        const key = member.email.toLowerCase();
        if (key !== "" && firstIndexByEmail.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: "duplicate email",
            path: [index, "email"],
          });
        }
        if (!firstIndexByEmail.has(key)) firstIndexByEmail.set(key, index);
      });
    }),
});

type Schema = typeof schema;

type MemberRowProps = Readonly<{
  form: Form<Schema>;
  index: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}>;

// One memoized component per row: the per-row useField subscriptions keep
// each row's reads self-contained, and memo (every prop here is stable —
// useFieldArray's move/remove are useCallback'd) is what actually stops
// keystrokes in one row, or in the team name, from re-rendering the others.
// Without memo the parent re-renders on any member edit (its useFieldArray
// slice changes identity) and would take every row with it.
const MemberRow = memo(({ form, index, move, remove }: MemberRowProps) => {
  const name = useField(form, `members.${index}.name`);
  const email = useField(form, `members.${index}.email`);
  const role = useField(form, `members.${index}.role`);

  return (
    <div className="grid grid-cols-[1fr_1.3fr_auto_auto_auto] items-start gap-2">
      <div className="grid gap-1">
        <Input placeholder="Name" {...shadcnInputProps(name)} />
        <FieldError field={name} />
      </div>
      <div className="grid gap-1">
        <Input placeholder="email@team.dev" {...shadcnInputProps(email)} />
        <FieldError field={email} />
      </div>
      <Select {...shadcnSelectProps(role)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Move up"
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove member"
        onClick={() => remove(index)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
});

export const ShadcnTeamForm = () => {
  const form = useForm(schema, {
    initialValues: {
      teamName: "Forms Guild",
      members: [
        { name: "Tim", email: "tim@team.dev", role: "engineer" },
        { name: "Ada", email: "ada@team.dev", role: "manager" },
      ],
    },
    mode: "onChange",
  });
  useDemoForm(form);
  const teamName = useField(form, "teamName");
  const members = useFieldArray<Member>(form, "members");
  const [savedCount, setSavedCount] = useState<number | null>(null);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Team roster</CardTitle>
        <CardDescription>
          <code>useFieldArray</code> rows with stable ids — reorder after
          editing and the drafts follow their rows. Duplicate emails are a
          cross-row <code>superRefine</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="team-name">Team name</Label>
          <Input id="team-name" {...shadcnInputProps(teamName)} />
          <FieldError field={teamName} />
        </div>

        <div className="grid gap-2">
          <Label>Members</Label>
          {members.fields.map((entry, index) => (
            <MemberRow
              key={entry.id}
              form={form}
              index={index}
              move={members.move}
              remove={members.remove}
            />
          ))}
          <FieldError field={members} />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            members.push({ name: "", email: "", role: "engineer" })
          }
        >
          <PlusIcon />
          Add member
        </Button>
      </CardContent>
      <CardFooter className="gap-3">
        <Button
          onClick={() =>
            void form.handleSubmit((data) => {
              setSavedCount(data.members.length);
            })()
          }
        >
          Save roster
        </Button>
        {savedCount !== null ? (
          <span className="text-sm text-muted-foreground">
            saved {savedCount} member{savedCount === 1 ? "" : "s"}.
          </span>
        ) : null}
      </CardFooter>
    </Card>
  );
};
