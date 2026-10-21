import { selectProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { LAPTOP_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type LaptopFieldProps = Readonly<{ label?: string }>;

export const useLaptopField = () => useOnboardingField("equipment.laptop");

export const LaptopField = ({ label = "Laptop" }: LaptopFieldProps) => {
  const field = useLaptopField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <select {...selectProps(field)} {...a11y.control}>
        <option value="">Select…</option>
        {LAPTOP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
