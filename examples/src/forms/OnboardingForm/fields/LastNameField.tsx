import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type LastNameFieldProps = Readonly<{ label?: string }>;

export const useLastNameField = () => useOnboardingField("personal.lastName");

export const LastNameField = ({ label = "Last name" }: LastNameFieldProps) => {
  const field = useLastNameField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
