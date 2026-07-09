import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type UnitFieldProps = Readonly<{ label?: string }>;

export const useUnitField = () => useOnboardingField("address.unit");

export const UnitField = ({ label = "Unit / apt (optional)" }: UnitFieldProps) => {
  const field = useUnitField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.unit">{label}</Label>
      <Input id="onbsc-address.unit" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
