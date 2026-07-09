import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type StartDateFieldProps = Readonly<{ label?: string }>;

export const useStartDateField = () => useOnboardingField("employment.startDate");

export const StartDateField = ({ label = "Start date" }: StartDateFieldProps) => {
  const field = useStartDateField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.startDate">{label}</Label>
      <Input id="onbsc-employment.startDate" type="date" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
