import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type NotesFieldProps = Readonly<{ label?: string }>;

export const useNotesField = () => useOnboardingField("equipment.notes");

export const NotesField = ({ label = "Anything else? (optional)" }: NotesFieldProps) => {
  const field = useNotesField();
  return (
    <div className="field">
      <label>{label}</label>
      <textarea rows={3} {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
