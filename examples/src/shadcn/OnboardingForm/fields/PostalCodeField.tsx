import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type PostalCodeFieldProps = Readonly<{ label?: string }>;

export const usePostalCodeField = () => useOnboardingField("address.postalCode");

export const PostalCodeField = ({ label = "Postal code" }: PostalCodeFieldProps) => {
  const field = usePostalCodeField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.postalCode">{label}</Label>
      <Input id="onbsc-address.postalCode" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
