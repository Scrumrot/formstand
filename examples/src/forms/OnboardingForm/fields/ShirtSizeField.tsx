import { selectProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { SHIRT_SIZE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type ShirtSizeFieldProps = Readonly<{ label?: string }>;

export const useShirtSizeField = () => useOnboardingField("equipment.shirtSize");

export const ShirtSizeField = ({ label = "Shirt size" }: ShirtSizeFieldProps) => {
  const field = useShirtSizeField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <select {...selectProps(field)} {...a11y.control}>
        <option value="">Select…</option>
        {SHIRT_SIZE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
