import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type UnitFieldProps = Readonly<{ label?: string }>;

export const useUnitField = () => useOnboardingField("address.unit");

export const UnitField = ({ label = "Unit / apt (optional)" }: UnitFieldProps) => {
  const field = useUnitField();
  return (
    <div className="field">
      <label>{label}</label>
      <input {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
