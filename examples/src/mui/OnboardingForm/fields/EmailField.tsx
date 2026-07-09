import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type EmailFieldProps = Readonly<{ label?: string }>;

export const useEmailField = () => useOnboardingField("personal.email");

export const EmailField = ({ label = "Personal email" }: EmailFieldProps) => {
  const field = useEmailField();
  return <TextField fullWidth type="email" label={label} {...muiTextFieldProps(field)} />;
};
