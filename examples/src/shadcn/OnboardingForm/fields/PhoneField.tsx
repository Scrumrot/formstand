import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type PhoneFieldProps = Readonly<{ label?: string }>;

export const usePhoneField = () => useOnboardingField("personal.phone");

export const PhoneField = ({ label = "Phone" }: PhoneFieldProps) => {
  const field = usePhoneField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-personal.phone">{label}</Label>
      <Input id="onbsc-personal.phone" type="tel" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
