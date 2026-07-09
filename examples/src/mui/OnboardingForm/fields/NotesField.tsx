import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type NotesFieldProps = Readonly<{ label?: string }>;

export const useNotesField = () => useOnboardingField("equipment.notes");

export const NotesField = ({ label = "Anything else? (optional)" }: NotesFieldProps) => {
  const field = useNotesField();
  return <TextField fullWidth multiline minRows={3} label={label} {...muiTextFieldProps(field)} />;
};
