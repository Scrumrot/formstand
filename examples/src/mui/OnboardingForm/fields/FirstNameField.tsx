import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type FirstNameFieldProps = Readonly<{ label?: string }>;

export const useFirstNameField = () => useOnboardingField("personal.firstName");

export const FirstNameField = ({ label = "First name" }: FirstNameFieldProps) => {
  const field = useFirstNameField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
