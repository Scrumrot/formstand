import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type PreferredNameFieldProps = Readonly<{ label?: string }>;

export const usePreferredNameField = () => useOnboardingField("personal.preferredName");

export const PreferredNameField = ({ label = "Preferred name (optional)" }: PreferredNameFieldProps) => {
  const field = usePreferredNameField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
