import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type NotesFieldProps = Readonly<{ label?: string }>;

export const useNotesField = () => useOnboardingField("equipment.notes");

export const NotesField = ({ label = "Anything else? (optional)" }: NotesFieldProps) => {
  const field = useNotesField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <textarea rows={3} {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
