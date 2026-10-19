import { useState } from "react";
import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useVariantField,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

// Conditional fields as the schema sees them: ONE discriminated union, not
// a flat object with every branch's fields plus a superRefine. The flat
// version kept the hidden branch's values in state, so switching from card
// to bank and paying submitted a payload with cardNumber "1234" AND the bank
// fields; z.discriminatedUnion parses only the active variant's keys, and
// swapping the whole variant object on method change (below) means the
// other branch's text is gone from state too, not just hidden.
const cardVariant = z.object({
  paymentMethod: z.literal("card"),
  cardNumber: z.string().regex(/^\d{16}$/, "16 digits required"),
  cvv: z.string().length(3, "3 digits"),
});

const bankVariant = z.object({
  paymentMethod: z.literal("bank"),
  accountNumber: z.string().regex(/^\d{8,12}$/, "8-12 digits"),
  routingNumber: z.string().length(9, "9 digits"),
});

const schema = z.object({
  payment: z.discriminatedUnion("paymentMethod", [cardVariant, bankVariant]),
});

type Payment = z.input<typeof schema>["payment"];
type PaymentMethod = Payment["paymentMethod"];

// The blank value for each branch, exhaustive over the discriminant so a
// new variant without an empty shape is a compile error. Selecting a method
// writes this whole object: the previous branch's fields leave state
// instead of lingering as unseen, unvalidated keys.
const EMPTY_PAYMENT: Readonly<Record<PaymentMethod, Payment>> = {
  card: { paymentMethod: "card", cardNumber: "", cvv: "" },
  bank: { paymentMethod: "bank", accountNumber: "", routingNumber: "" },
};

const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  card: "Card",
  bank: "Bank transfer",
};

const METHODS: readonly PaymentMethod[] = ["card", "bank"];

type VariantFieldProps = Readonly<{
  label: string;
  // Variant fields widen to `| undefined` because they are absent while
  // the other branch is active; the text binding accepts that directly.
  field: ReturnType<typeof useVariantField<typeof schema, "payment", "cardNumber">>;
}>;

const VariantInput = ({ label, field }: VariantFieldProps) => {
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.firstError ?? " "}</span>
    </div>
  );
};

export const ConditionalForm = () => {
  const form = useForm(schema, {
    initialValues: { payment: EMPTY_PAYMENT.card },
    mode: "onBlur",
  });
  useDemoForm(form);
  // The discriminant is common to every variant, so it binds with plain
  // useField; the branch-only fields need useVariantField, which types each
  // one from the variants that declare it.
  const method = useField(form, "payment.paymentMethod");
  const cardNumber = useVariantField(form, "payment", "cardNumber");
  const cvv = useVariantField(form, "payment", "cvv");
  const accountNumber = useVariantField(form, "payment", "accountNumber");
  const routingNumber = useVariantField(form, "payment", "routingNumber");
  const [paid, setPaid] = useState<string | null>(null);
  const methodA11y = fieldA11y(method, "payment-method");

  return (
    <form
      onSubmit={form.handleSubmit(
        (data) => {
          setPaid(JSON.stringify(data.payment));
        },
        (errors) => {
          focusFirstError(errors);
        },
      )}
    >
      <p className="subtitle">
        <code>z.discriminatedUnion("paymentMethod", [...])</code>: the
        discriminant binds with <code>useField</code>, each branch&apos;s own
        fields with <code>useVariantField</code>, and the parsed payload
        carries only the active branch. Type a card number, switch to bank,
        pay: no <code>cardNumber</code> in the result.
      </p>

      <div className="field">
        <label htmlFor="payment-method">Payment method</label>
        <select
          {...methodA11y.control}
          name={method.path}
          value={method.value}
          onChange={(event) => {
            // Swap the whole variant object, not just the discriminant, so
            // the hidden branch's text does not survive in state.
            form.setValue(
              "payment",
              EMPTY_PAYMENT[event.target.value as PaymentMethod],
            );
          }}
          onBlur={method.onBlur}
        >
          {METHODS.map((value) => (
            <option key={value} value={value}>
              {METHOD_LABEL[value]}
            </option>
          ))}
        </select>
        <span {...methodA11y.message}>{method.firstError ?? " "}</span>
      </div>

      {method.value === "card" ? (
        <>
          <VariantInput label="Card number" field={cardNumber} />
          <VariantInput label="CVV" field={cvv} />
        </>
      ) : (
        <>
          <VariantInput label="Account number" field={accountNumber} />
          <VariantInput label="Routing number" field={routingNumber} />
        </>
      )}

      <button className="primary" type="submit">
        Pay
      </button>

      {paid !== null ? (
        <p className="subtitle" role="status" style={{ marginTop: 12 }}>
          Paid: <code>{paid}</code>
        </p>
      ) : null}
    </form>
  );
};
