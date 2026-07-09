import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type StreetFieldProps = Readonly<{ label?: string }>;

export const useStreetField = () => useOnboardingField("address.street");

export const StreetField = ({ label = "Street" }: StreetFieldProps) => {
  const field = useStreetField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.street">{label}</Label>
      <Input id="onbsc-address.street" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
