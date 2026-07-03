import { SelectField, TextField, useForm, useFormSelector } from "formstand";
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
  const method = useFormSelector(form, (s) => s.values.paymentMethod);

  return (
    <form
      onSubmit={form.handleSubmit((data) => {
        window.alert(`paid: ${JSON.stringify(data)}`);
      })}
    >
      <p className="subtitle">
        Uses the library&apos;s bound <code>SelectField</code> /{" "}
        <code>TextField</code> — labels, ids, <code>name</code>,{" "}
        <code>aria-invalid</code> and error text come wired for free.
      </p>

      <SelectField
        form={form}
        path="paymentMethod"
        label="Payment method"
        options={[
          { value: "card", label: "Card" },
          { value: "bank", label: "Bank transfer" },
        ]}
      />

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
