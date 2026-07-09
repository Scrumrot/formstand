import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { useOnboardingField } from "../hooks";

export type NotesFieldProps = Readonly<{ label?: string }>;

export const useNotesField = () => useOnboardingField("equipment.notes");

export const NotesField = ({ label = "Anything else? (optional)" }: NotesFieldProps) => {
  const field = useNotesField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-equipment.notes">{label}</Label>
      <Textarea id="onbsc-equipment.notes" rows={3} {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
