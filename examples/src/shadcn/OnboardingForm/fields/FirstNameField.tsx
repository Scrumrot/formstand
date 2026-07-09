import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type FirstNameFieldProps = Readonly<{ label?: string }>;

export const useFirstNameField = () => useOnboardingField("personal.firstName");

export const FirstNameField = ({ label = "First name" }: FirstNameFieldProps) => {
  const field = useFirstNameField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-personal.firstName">{label}</Label>
      <Input id="onbsc-personal.firstName" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
