import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type LastNameFieldProps = Readonly<{ label?: string }>;

export const useLastNameField = () => useOnboardingField("personal.lastName");

export const LastNameField = ({ label = "Last name" }: LastNameFieldProps) => {
  const field = useLastNameField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-personal.lastName">{label}</Label>
      <Input id="onbsc-personal.lastName" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
