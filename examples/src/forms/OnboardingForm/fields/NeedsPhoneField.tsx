import { checkboxProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type NeedsPhoneFieldProps = Readonly<{ label?: string }>;

export const useNeedsPhoneField = () => useOnboardingField("equipment.needsPhone");

export const NeedsPhoneField = ({ label = "Company phone needed" }: NeedsPhoneFieldProps) => {
  const field = useNeedsPhoneField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label className="row" style={{ gap: 8 }}>
        <input {...checkboxProps(field)} {...a11y.control} />
        {label}
      </label>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
