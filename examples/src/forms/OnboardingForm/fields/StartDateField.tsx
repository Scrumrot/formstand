import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type StartDateFieldProps = Readonly<{ label?: string }>;

export const useStartDateField = () => useOnboardingField("employment.startDate");

export const StartDateField = ({ label = "Start date" }: StartDateFieldProps) => {
  const field = useStartDateField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input type="date" {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
