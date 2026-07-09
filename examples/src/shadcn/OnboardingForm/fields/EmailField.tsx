import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type EmailFieldProps = Readonly<{ label?: string }>;

export const useEmailField = () => useOnboardingField("personal.email");

export const EmailField = ({ label = "Personal email" }: EmailFieldProps) => {
  const field = useEmailField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-personal.email">{label}</Label>
      <Input id="onbsc-personal.email" type="email" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
