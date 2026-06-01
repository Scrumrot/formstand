import {
  type FieldFormApi,
  numberInputProps,
  textInputProps,
  useField,
  useFieldArray,
  useForm,
  useFormStateShallow,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const lineItemSchema = z.object({
  description: z.string().min(1, "required"),
  quantity: z.int().positive("must be > 0"),
  unitPrice: z.number().nonnegative("must be >= 0"),
});

const schema = z.object({
  customer: z.string().min(1, "required"),
  lineItems: z.array(lineItemSchema).min(1, "at least one item"),
});

type LineItem = z.input<typeof lineItemSchema>;

type LineItemRowProps = Readonly<{
  form: FieldFormApi;
  index: number;
  onRemove: () => void;
}>;

const LineItemRow = ({ form, index, onRemove }: LineItemRowProps) => {
  const description = useField<string>(form, `lineItems.${index}.description`);
  const quantity = useField<number | undefined>(
    form,
    `lineItems.${index}.quantity`,
  );
  const unitPrice = useField<number | undefined>(
    form,
    `lineItems.${index}.unitPrice`,
  );

  const qty = quantity.value ?? 0;
  const price = unitPrice.value ?? 0;
  const subtotal = qty * price;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr auto auto",
        gap: 8,
        marginBottom: 8,
        alignItems: "start",
      }}
    >
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
        <input
          placeholder="qty"
          {...numberInputProps(quantity)}
          style={{ width: "100%" }}
        />
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
      <div style={{ paddingTop: 10, color: "#8b94a7", fontSize: 13 }}>
        ${subtotal.toFixed(2)}
      </div>
      <button className="secondary" type="button" onClick={onRemove}>
        ×
      </button>
    </div>
  );
};

const Total = ({ form }: Readonly<{ form: FieldFormApi }>) => {
  const items = useFormStateShallow(form, (s) => {
    const list = (s.values as { lineItems?: readonly LineItem[] }).lineItems;
    return list ?? [];
  });
  const total = items.reduce(
    (acc, item) => acc + (item.quantity ?? 0) * (item.unitPrice ?? 0),
    0,
  );
  return (
    <div style={{ textAlign: "right", marginTop: 16, fontSize: 18 }}>
      Total: <strong>${total.toFixed(2)}</strong>
    </div>
  );
};

export const InvoiceForm = () => {
  const form = useForm(schema, {
    initialValues: {
      customer: "",
      lineItems: [{ description: "", quantity: 1, unitPrice: 0 }],
    },
    mode: "onBlur",
  });
  const customer = useField(form, "customer");
  const lineItems = useFieldArray<LineItem>(form, "lineItems");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`invoice: ${JSON.stringify(data, null, 2)}`);
        });
      }}
    >
      <div className="field">
        <label>Customer</label>
        <input {...textInputProps(customer)} />
        <span className="error">{customer.error?.[0] ?? " "}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>Line items</strong>
      </div>

      {lineItems.fields.map((field, index) => (
        <LineItemRow
          key={field.id}
          form={form}
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
      </div>

      <Total form={form} />

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit">
          Submit invoice
        </button>
      </div>

      <StateDump form={form} />
    </form>
  );
};
