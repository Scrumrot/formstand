import { checkboxProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type NeedsPhoneFieldProps = Readonly<{ label?: string }>;

export const useNeedsPhoneField = () => useOnboardingField("equipment.needsPhone");

export const NeedsPhoneField = ({ label = "Company phone needed" }: NeedsPhoneFieldProps) => {
  const field = useNeedsPhoneField();
  return (
    <div className="field">
      <label className="row" style={{ gap: 8 }}>
        <input {...checkboxProps(field)} />
        {label}
      </label>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
