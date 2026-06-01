import {
  type FieldFormApi,
  useField,
  useFieldArray,
  useForm,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  users: z
    .array(
      z.object({
        email: z.email("must be a valid email"),
      }),
    )
    .min(1, "at least one user required"),
});

type UserItem = Readonly<{ email: string }>;

type UserRowProps = Readonly<{
  form: FieldFormApi;
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
  const email = useField<string>(form, `users.${index}.email`);
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
  const users = useFieldArray<UserItem>(form, "users");

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

      <StateDump form={form} />
    </form>
  );
};
