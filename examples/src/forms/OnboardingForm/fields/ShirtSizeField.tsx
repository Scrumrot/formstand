import { selectProps } from "formstand";
import { SHIRT_SIZE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type ShirtSizeFieldProps = Readonly<{ label?: string }>;

export const useShirtSizeField = () => useOnboardingField("equipment.shirtSize");

export const ShirtSizeField = ({ label = "Shirt size" }: ShirtSizeFieldProps) => {
  const field = useShirtSizeField();
  return (
    <div className="field">
      <label>{label}</label>
      <select {...selectProps(field)}>
        <option value="">Select…</option>
        {SHIRT_SIZE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
