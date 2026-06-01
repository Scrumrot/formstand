import { type FieldFormApi, useField, useForm, useFormState } from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const cardRegex = /^\d{16}$/;
const accountRegex = /^\d{8,12}$/;

const schema = z
  .object({
    paymentMethod: z.enum(["card", "bank"]),
    cardNumber: z.string(),
    cvv: z.string(),
    accountNumber: z.string(),
    routingNumber: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "card") {
      if (!cardRegex.test(data.cardNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["cardNumber"],
          message: "16 digits required",
        });
      }
      if (data.cvv.length !== 3) {
        ctx.addIssue({
          code: "custom",
          path: ["cvv"],
          message: "3 digits",
        });
      }
    }
    if (data.paymentMethod === "bank") {
      if (!accountRegex.test(data.accountNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message: "8-12 digits",
        });
      }
      if (data.routingNumber.length !== 9) {
        ctx.addIssue({
          code: "custom",
          path: ["routingNumber"],
          message: "9 digits",
        });
      }
    }
  });

type TextFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label: string;
}>;

const TextField = ({ form, path, label }: TextFieldProps) => {
  const field = useField<string>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={field.value ?? ""}
        onChange={(e) => field.setValue(e.target.value)}
        onBlur={field.onBlur}
      />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};

export const ConditionalForm = () => {
  const form = useForm(schema, {
    initialValues: {
      paymentMethod: "card",
      cardNumber: "",
      cvv: "",
      accountNumber: "",
      routingNumber: "",
    },
    mode: "onBlur",
  });
  const method = useFormState(form, (s) => s.values.paymentMethod);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`paid: ${JSON.stringify(data)}`);
        });
      }}
    >
      <div className="field">
        <label>Payment method</label>
        <select
          value={method}
          onChange={(e) =>
            form.setValue("paymentMethod", e.target.value as "card" | "bank")
          }
        >
          <option value="card">Card</option>
          <option value="bank">Bank transfer</option>
        </select>
      </div>

      {method === "card" ? (
        <>
          <TextField form={form} path="cardNumber" label="Card number" />
          <TextField form={form} path="cvv" label="CVV" />
        </>
      ) : (
        <>
          <TextField form={form} path="accountNumber" label="Account number" />
          <TextField
            form={form}
            path="routingNumber"
            label="Routing number"
          />
        </>
      )}

      <button className="primary" type="submit">
        Pay
      </button>

      <StateDump form={form} />
    </form>
  );
};
