import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type CityFieldProps = Readonly<{ label?: string }>;

export const useCityField = () => useOnboardingField("address.city");

export const CityField = ({ label = "City" }: CityFieldProps) => {
  const field = useCityField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.city">{label}</Label>
      <Input id="onbsc-address.city" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
