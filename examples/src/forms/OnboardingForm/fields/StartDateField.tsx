import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type StartDateFieldProps = Readonly<{ label?: string }>;

export const useStartDateField = () => useOnboardingField("employment.startDate");

export const StartDateField = ({ label = "Start date" }: StartDateFieldProps) => {
  const field = useStartDateField();
  return (
    <div className="field">
      <label>{label}</label>
      <input type="date" {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
