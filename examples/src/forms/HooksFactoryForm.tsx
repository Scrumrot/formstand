import {
  createForm,
  createFormHooks,
  numberInputProps,
  textInputProps,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";

const lineItemSchema = z.object({
  description: z.string().min(1, "required"),
  quantity: z.int().positive("must be > 0"),
  unitPrice: z.number().nonnegative("must be >= 0"),
});

const schema = z.object({
  customer: z.string().min(1, "required"),
  lineItems: z.array(lineItemSchema).min(1, "at least one item"),
});

// The form lives at module scope — one instance for the app's lifetime —
// and createFormHooks bakes it into the hooks it returns. No provider, no
// form prop: components below just import their domain's hooks. (Because
// the form never unmounts, edits here survive switching tabs — that's the
// singleton behaving as designed. Per-mount lifecycles want useForm +
// createFormContext instead.)
const invoiceForm = createForm(schema, {
  initialValues: {
    customer: "",
    lineItems: [{ description: "", quantity: 1, unitPrice: 0 }],
  },
  mode: "onBlur",
});

export const {
  useInvoiceField,
  useInvoiceFieldArray,
  useInvoiceSelector,
  useInvoiceIsDirty,
  useInvoiceIsSubmitting,
} = createFormHooks(invoiceForm, "invoice");

// No `form` prop — the row's hooks are already wired to the invoice form,
// and paths stay schema-typed (a typo'd path is a compile error).
const LineItemRow = ({
  index,
  onRemove,
}: Readonly<{ index: number; onRemove: () => void }>) => {
  const description = useInvoiceField(`lineItems.${index}.description`);
  const quantity = useInvoiceField(`lineItems.${index}.quantity`);
  const unitPrice = useInvoiceField(`lineItems.${index}.unitPrice`);

  return (
    <div className="array-item" style={{ gridTemplateColumns: "2fr 1fr 1fr auto" }}>
      <div>
        <input
          placeholder="description"
          {...textInputProps(description)}
          style={{ width: "100%" }}
        />
        <div className="error" style={{ marginTop: 4 }}>
          {description.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input placeholder="qty" {...numberInputProps(quantity)} style={{ width: "100%" }} />
        <div className="error" style={{ marginTop: 4 }}>
          {quantity.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input
          placeholder="price"
          {...numberInputProps(unitPrice)}
          step="0.01"
          style={{ width: "100%" }}
        />
        <div className="error" style={{ marginTop: 4 }}>
          {unitPrice.error?.[0] ?? " "}
        </div>
      </div>
      <button className="secondary" type="button" onClick={onRemove}>
        ×
      </button>
    </div>
  );
};

const Total = () => {
  const total = useInvoiceSelector((s) =>
    s.values.lineItems.reduce(
      (acc, item) => acc + (item.quantity ?? 0) * (item.unitPrice ?? 0),
      0,
    ),
  );
  return (
    <div style={{ textAlign: "right", marginTop: 16, fontSize: 18 }}>
      Total: <strong>${total.toFixed(2)}</strong>
    </div>
  );
};

export const HooksFactoryForm = () => {
  useDemoForm(invoiceForm);
  const customer = useInvoiceField("customer");
  const lineItems = useInvoiceFieldArray("lineItems");
  const isDirty = useInvoiceIsDirty();
  const isSubmitting = useInvoiceIsSubmitting();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void invoiceForm.submit((data) => {
          window.alert(`invoice: ${JSON.stringify(data, null, 2)}`);
        });
      }}
    >
      <p style={{ color: "#8b94a7", fontSize: 13, marginTop: 0 }}>
        <code>createFormHooks(form, "invoice")</code> — the form is a module
        singleton and every hook is pre-wired to it: no provider, no{" "}
        <code>form</code> prop anywhere below. Edits survive switching tabs
        (the form never unmounts); Reset puts it back.
      </p>

      <div className="field">
        <label>Customer</label>
        <input {...textInputProps(customer)} />
        <span className="error">{customer.error?.[0] ?? " "}</span>
      </div>

      {lineItems.fields.map((field, index) => (
        <LineItemRow
          key={field.id}
          index={index}
          onRemove={() => lineItems.remove(index)}
        />
      ))}

      {lineItems.error ? (
        <div className="error" style={{ marginBottom: 8 }}>
          {lineItems.error[0]}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="secondary"
          type="button"
          onClick={() =>
            lineItems.push({ description: "", quantity: 1, unitPrice: 0 })
          }
        >
          + add line
        </button>
        <button
          className="secondary"
          type="button"
          disabled={!isDirty}
          onClick={() => invoiceForm.reset()}
        >
          Reset
        </button>
      </div>

      <Total />

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={isSubmitting}>
          Submit invoice
        </button>
      </div>
    </form>
  );
};
