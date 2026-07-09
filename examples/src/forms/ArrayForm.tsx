import { type Form, useField, useFieldArray, useForm } from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

const schema = z.object({
  users: z
    .array(
      z.object({
        email: z.email("must be a valid email"),
      }),
    )
    .min(1, "at least one user required"),
});

type Schema = typeof schema;

type UserRowProps = Readonly<{
  // Typed as Form<Schema> (not the schema-less FieldFormApi) so useField
  // infers each field's value type straight from the path.
  form: Form<Schema>;
  id: string;
  index: number;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}>;

const UserRow = ({
  form,
  index,
  onRemove,
  onUp,
  onDown,
  canMoveUp,
  canMoveDown,
}: UserRowProps) => {
  const email = useField(form, `users.${index}.email`);
  return (
    <div className="array-item">
      <div>
        <input
          value={email.value ?? ""}
          onChange={(e) => email.setValue(e.target.value)}
          onBlur={email.onBlur}
          placeholder="email"
        />
        <div className="error" style={{ marginTop: 4 }}>
          {email.error?.[0] ?? " "}
        </div>
      </div>
      <button className="secondary" type="button" onClick={onUp} disabled={!canMoveUp}>
        ↑
      </button>
      <button className="secondary" type="button" onClick={onDown} disabled={!canMoveDown}>
        ↓
      </button>
      <button className="secondary" type="button" onClick={onRemove}>
        remove
      </button>
    </div>
  );
};

export const ArrayForm = () => {
  const form = useForm(schema, {
    initialValues: { users: [{ email: "a@a.com" }, { email: "b@b.com" }] },
    mode: "onBlur",
  });
  useDemoForm(form);
  // The item type is inferred from the schema through the path — push()
  // below knows a user is { email: string } with no annotation.
  const users = useFieldArray(form, "users");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`submit ok: ${JSON.stringify(data)}`);
        });
      }}
    >
      {users.fields.map((field, index) => (
        <UserRow
          key={field.id}
          form={form}
          id={field.id}
          index={index}
          onRemove={() => users.remove(index)}
          onUp={() => users.move(index, index - 1)}
          onDown={() => users.move(index, index + 1)}
          canMoveUp={index > 0}
          canMoveDown={index < users.length - 1}
        />
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="secondary"
          type="button"
          onClick={() => users.push({ email: "" })}
        >
          + add user
        </button>
        <button className="primary" type="submit">
          Submit
        </button>
      </div>
    </form>
  );
};
