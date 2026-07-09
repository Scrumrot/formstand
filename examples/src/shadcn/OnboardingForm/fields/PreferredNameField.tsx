import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type PreferredNameFieldProps = Readonly<{ label?: string }>;

export const usePreferredNameField = () => useOnboardingField("personal.preferredName");

export const PreferredNameField = ({ label = "Preferred name (optional)" }: PreferredNameFieldProps) => {
  const field = usePreferredNameField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-personal.preferredName">{label}</Label>
      <Input id="onbsc-personal.preferredName" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
