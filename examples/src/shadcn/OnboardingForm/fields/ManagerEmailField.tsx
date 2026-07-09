import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type ManagerEmailFieldProps = Readonly<{ label?: string }>;

export const useManagerEmailField = () => useOnboardingField("employment.managerEmail");

export const ManagerEmailField = ({ label = "Manager's email" }: ManagerEmailFieldProps) => {
  const field = useManagerEmailField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.managerEmail">{label}</Label>
      <Input id="onbsc-employment.managerEmail" type="email" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
