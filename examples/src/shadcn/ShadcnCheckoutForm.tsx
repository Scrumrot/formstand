import { useState } from "react";
import {
  numberInputProps,
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import { FieldError } from "./FieldError";
import { ariaInvalid, shadcnRadioGroupProps, shadcnSelectProps } from "./shadcnAdapter";
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
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

const COUNTRIES = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
] as const;

const SHIPPING = [
  { value: "standard", label: "Standard (5–7 days)", price: 0 },
  { value: "express", label: "Express (2 days)", price: 9 },
  { value: "overnight", label: "Overnight", price: 24 },
] as const;

const UNIT_PRICE = 19;

const schema = z.object({
  country: z.enum(["us", "ca", "de", "jp"], "pick a country"),
  shipping: z.enum(["standard", "express", "overnight"]),
  quantity: z
    .number("quantity required")
    .int("whole units only")
    .min(1, "at least 1")
    .max(99, "99 max"),
  // "No note" is null, not "" — clearing the textarea round-trips to null
  // via field.emptyValue.
  giftNote: z.string().max(120, "120 chars max").nullable(),
});

export const ShadcnCheckoutForm = () => {
  const form = useForm(schema, {
    initialValues: {
      // The select starts empty: Radix shows the placeholder for "", and
      // submit surfaces the enum's "pick a country" message.
      country: "" as never,
      shipping: "standard",
      quantity: 1,
      giftNote: null,
    },
    mode: "onChange",
  });
  useDemoForm(form);
  const country = useField(form, "country");
  const shipping = useField(form, "shipping");
  const quantity = useField(form, "quantity");
  const giftNote = useField(form, "giftNote");
  const [placed, setPlaced] = useState(false);

  // Derived money line — recomputes only when the inputs it reads change.
  const total = useFormSelector(form, (state) => {
    const rate =
      SHIPPING.find((s) => s.value === state.values.shipping)?.price ?? 0;
    return (state.values.quantity ?? 0) * UNIT_PRICE + rate;
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Checkout</CardTitle>
        <CardDescription>
          Radix Select and RadioGroup speak <code>onValueChange</code>, not
          DOM events — the adapter maps closing the dropdown to the blur
          trigger.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label>Country</Label>
          <Select {...shadcnSelectProps(country)}>
            <SelectTrigger
              className="w-full"
              aria-invalid={ariaInvalid(country)}
            >
              <SelectValue placeholder="Select a country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError field={country} />
        </div>

        <div className="grid gap-2">
          <Label>Shipping</Label>
          <RadioGroup {...shadcnRadioGroupProps(shipping)}>
            {SHIPPING.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`ship-${option.value}`}
                  value={option.value}
                />
                <Label
                  htmlFor={`ship-${option.value}`}
                  className="font-normal"
                >
                  {option.label}
                  <span className="text-muted-foreground">
                    {option.price === 0 ? "free" : `$${option.price}`}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="checkout-qty">Quantity (${UNIT_PRICE} each)</Label>
          <Input
            id="checkout-qty"
            className="w-24"
            {...numberInputProps(quantity)}
          />
          <FieldError field={quantity} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="checkout-note">Gift note (optional)</Label>
          <Textarea
            id="checkout-note"
            placeholder="Happy birthday!"
            {...textInputProps(giftNote)}
          />
          <p className="text-sm text-muted-foreground">
            nullable field — store value is{" "}
            <code>{giftNote.value === null ? "null" : "a string"}</code>;
            clearing it writes null back, not "".
          </p>
          <FieldError field={giftNote} />
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-sm">
          Total: <span className="font-semibold">${total}</span>
        </p>
        <Button
          onClick={() =>
            void form.handleSubmit(() => {
              setPlaced(true);
            })()
          }
        >
          Place order
        </Button>
      </CardFooter>
      {placed ? (
        <p className="px-4 pb-2 text-sm text-muted-foreground">
          order placed — thanks!
        </p>
      ) : null}
    </Card>
  );
};
